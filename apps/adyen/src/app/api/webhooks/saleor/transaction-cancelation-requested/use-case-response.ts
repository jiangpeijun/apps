// apps/adyen/src/app/api/webhooks/saleor/transaction-cancelation-requested/use-case-response.ts
import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type AppContext } from "@/lib/app-context";

export type SaleorMoney = {
  amount: number;
  currency: string;
};

const normalizeMoney = (money: SaleorMoney): SaleorMoney => ({
  amount: Number(Number(money.amount).toFixed(2)),
  currency: money.currency,
});

const isValidMoney = (money: SaleorMoney | null): money is SaleorMoney =>
  Boolean(money && Number.isFinite(Number(money.amount)) && Number(money.amount) > 0);

/** CANCEL_SUCCESS：Adyen 已受理取消。amount 显式返回，避免依赖 Saleor 的默认回填 */
class Success extends SuccessWebhookResponse {
  readonly kind = "CANCEL_SUCCESS" as const;
  readonly pspReference: string;
  readonly amount: SaleorMoney | null;

  constructor(args: { pspReference: string; amount?: SaleorMoney | null; appContext: AppContext }) {
    super(args.appContext);
    this.pspReference = args.pspReference;
    this.amount = args.amount ?? null;
  }

  getResponse() {
    return Response.json(
      {
        result: this.kind,
        pspReference: this.pspReference,
        ...(isValidMoney(this.amount) ? { amount: normalizeMoney(this.amount) } : {}),
      },
      { status: this.statusCode },
    );
  }
}

/** CANCEL_FAILURE：pspReference 可省略；amount 省略时由 Saleor 按关联事件回填 */
class Failure extends SuccessWebhookResponse {
  readonly kind = "CANCEL_FAILURE" as const;
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
        ...(isValidMoney(this.amount) ? { amount: normalizeMoney(this.amount) } : {}),
        message: this.message,
      },
      // 必须 200：Saleor 靠 body 的 result 判失败，5xx 会被当成传输错误
      { status: this.statusCode },
    );
  }
}

export const TransactionCancelationRequestedUseCaseResponses = {
  Success,
  Failure,
};

export type TransactionCancelationRequestedUseCaseResponsesType = InstanceType<
  | typeof TransactionCancelationRequestedUseCaseResponses.Success
  | typeof TransactionCancelationRequestedUseCaseResponses.Failure
>;
