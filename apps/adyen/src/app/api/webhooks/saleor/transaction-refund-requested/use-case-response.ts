// apps\adyen\src\app\api\webhooks\saleor\transaction-refund-requested\use-case-response.ts
import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type AppContext } from "@/lib/app-context";

/**
 * Saleor 的 Money 形状。TransactionRequestResponse.amount 是 Money 而不是 number，
 * 传裸数字会被 Saleor 判为 ParseError，退款不会落账。
 */
export type SaleorMoney = {
  amount: number;
  currency: string;
};

/** 去掉浮点噪音；JPY 这类零小数位货币不受影响 */
export const normalizeMoney = (money: SaleorMoney): SaleorMoney => ({
  amount: Number(Number(money.amount).toFixed(2)),
  currency: money.currency,
});

/**
 * 与当前 TransactionRefundRequestedEventFragment 的真实字段对齐：
 * 订阅里只有 action { amount: number, currency }，没有 event.amount / chargedAmount。
 * 保留 event.amount 分支，是为了将来把订阅补成 3.23 新字段后无需再改这里。
 */
export type RefundPayloadLike = {
  action?: { amount?: number | string | null; currency?: string | null } | null;
  amount?: { amount?: number | string | null; currency?: string | null } | null;
};

export const resolveRefundMoney = (payload: RefundPayloadLike): SaleorMoney | null => {
  const fromEvent = payload.amount;

  if (fromEvent?.amount != null && fromEvent.currency) {
    return normalizeMoney({ amount: Number(fromEvent.amount), currency: fromEvent.currency });
  }

  const fromAction = payload.action;

  if (fromAction?.amount != null && fromAction.currency) {
    return normalizeMoney({ amount: Number(fromAction.amount), currency: fromAction.currency });
  }

  return null;
};

/** REFUND_SUCCESS：Adyen 明确返回 refunded / settled，资金已完成 */
class Success extends SuccessWebhookResponse {
  readonly kind = "REFUND_SUCCESS" as const;
  readonly pspReference: string;
  readonly amount: SaleorMoney;

  constructor(args: { pspReference: string; amount: SaleorMoney; appContext: AppContext }) {
    super(args.appContext);
    this.pspReference = args.pspReference;
    this.amount = args.amount;
  }

  getResponse() {
    return Response.json(
      {
        result: this.kind,
        pspReference: this.pspReference,
        amount: normalizeMoney(this.amount),
      },
      { status: this.statusCode },
    );
  }
}

/** REFUND_REQUEST：Adyen 返回 received 或无明确终态，资金已受理未完成，等回调收口 */
class Pending extends SuccessWebhookResponse {
  readonly kind = "REFUND_REQUEST" as const;
  readonly pspReference: string;
  readonly amount: SaleorMoney;

  constructor(args: { pspReference: string; amount: SaleorMoney; appContext: AppContext }) {
    super(args.appContext);
    this.pspReference = args.pspReference;
    this.amount = args.amount;
  }

  getResponse() {
    return Response.json(
      {
        result: this.kind,
        pspReference: this.pspReference,
        amount: normalizeMoney(this.amount),
      },
      { status: this.statusCode },
    );
  }
}

/** REFUND_FAILURE：pspReference 与 amount 均可省略 */
class Failure extends SuccessWebhookResponse {
  readonly kind = "REFUND_FAILURE" as const;
  readonly pspReference: string | null;
  readonly amount: SaleorMoney | null;
  readonly message: string;

  constructor(args: {
    pspReference?: string | null;
    amount?: SaleorMoney | null;
    message: string;
    appContext: AppContext;
  }) {
    super(args.appContext);
    this.pspReference = args.pspReference ?? null;
    this.amount = args.amount ?? null;
    this.message = args.message;
  }

  getResponse() {
    return Response.json(
      {
        result: this.kind,
        ...(this.pspReference ? { pspReference: this.pspReference } : {}),
        ...(this.amount ? { amount: normalizeMoney(this.amount) } : {}),
        message: this.message,
      },
      // 必须是 200：Saleor 靠 body 里的 result 判定失败，5xx 会变成传输错误
      { status: this.statusCode },
    );
  }
}

export const TransactionRefundRequestedUseCaseResponses = {
  Success,
  Pending,
  Failure,
};

export type TransactionRefundRequestedUseCaseResponsesType = InstanceType<
  | typeof TransactionRefundRequestedUseCaseResponses.Success
  | typeof TransactionRefundRequestedUseCaseResponses.Pending
  | typeof TransactionRefundRequestedUseCaseResponses.Failure
>;
