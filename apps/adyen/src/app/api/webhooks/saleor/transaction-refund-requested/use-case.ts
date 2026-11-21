// apps/adyen/src/app/api/webhooks/saleor/transaction-refund-requested/use-case.ts
import { err, ok, type Result } from "neverthrow";

import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
  MalformedRequestResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type TransactionRefundRequestedEventFragment } from "@/generated/graphql";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { resolveAdyenAmount } from "@/modules/adyen/adyen-money";
import { ADYEN_TIMEOUT_MS, withTimeout } from "@/modules/adyen/adyen-timeout";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";

import {
  TransactionRefundRequestedUseCaseResponses,
  type TransactionRefundRequestedUseCaseResponsesType,
} from "./use-case-response";

type UseCaseExecuteResult = Result<
  TransactionRefundRequestedUseCaseResponsesType,
  AppIsNotConfiguredResponse | BrokenAppResponse | MalformedRequestResponse
>;

const logger = createLogger("TransactionRefundRequestedUseCase");

/**
 * Adyen 退款响应里的 status 判定。
 * refunded / refundSettled / sentToTerminal = 资金已完成 → REFUND_SUCCESS
 * received / pending / 空值       = 已受理未完成 → REFUND_REQUEST，等 Adyen 回调收口
 * 含 fail                          = 明确失败     → REFUND_FAILURE
 */
const resolveAdyenRefundStatus = (status: unknown): "completed" | "pending" | "failed" => {
  const normalized = String(status ?? "").toLowerCase();

  if (normalized.includes("fail")) {
    return "failed";
  }

  if (
    normalized === "refunded" ||
    normalized === "refundsettled" ||
    normalized === "senttoterminal"
  ) {
    return "completed";
  }

  return "pending";
};

export class TransactionRefundRequestedUseCase {
  private appConfigRepo: AppConfigRepo;

  constructor(deps: { appConfigRepo: AppConfigRepo }) {
    this.appConfigRepo = deps.appConfigRepo;
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionRefundRequestedEventFragment;
  }): Promise<UseCaseExecuteResult> {
    const { appId, saleorApiUrl, event } = args;
    const appContext = appContextContainer.getContextValue();
    const transaction = event.transaction;

    // Saleor 的 Money 形状，直接回给 TransactionRequestResponse.amount 用
    const saleorMoney = {
      amount: event.action.amount,
      currency: event.action.currency,
    };

    // 节点 1｜入口
    logger.info("Refund use case started", {
      appId,
      idempotencyKey: event.idempotencyKey,
      transactionId: transaction?.id ?? null,
      originalPspReference: transaction?.pspReference ?? null,
      amount: saleorMoney.amount,
      currency: saleorMoney.currency,
    });

    if (!transaction) {
      logger.error("Transaction is missing in the refund payload", {
        idempotencyKey: event.idempotencyKey,
      });
      return err(
        new MalformedRequestResponse(appContext, new BaseError("Transaction is missing")),
      );
    }

    if (!(saleorMoney.amount > 0)) {
      logger.error("Refund amount is not positive, refusing to call Adyen", {
        amount: saleorMoney.amount,
        currency: saleorMoney.currency,
      });
      return ok(
        new TransactionRefundRequestedUseCaseResponses.Failure({
          amount: saleorMoney,
          message: "Refund amount must be greater than zero",
          appContext,
        }),
      );
    }

    const channelId = transaction.checkout?.channel.id ?? transaction.order?.channel.id;

    if (!channelId) {
      logger.error("Channel ID is missing, cannot resolve Adyen config", {
        transactionId: transaction.id,
      });
      return err(
        new MalformedRequestResponse(appContext, new BaseError("Channel ID is missing")),
      );
    }

    // 节点 2｜解析配置
    const configResult = await this.appConfigRepo.getAdyenConfig({
      channelId,
      appId,
      saleorApiUrl,
    });

    if (configResult.isErr()) {
      logger.error("Failed to resolve Adyen config", {
        channelId,
        error: configResult.error.message,
      });
      return err(new BrokenAppResponse(appContext, configResult.error));
    }

    const config = configResult.value;

    if (!config) {
      logger.error("No Adyen config bound to channel", { channelId });
      return err(
        new AppIsNotConfiguredResponse(appContext, new BaseError("No config for channel")),
      );
    }

    logger.info("Adyen config resolved", {
      channelId,
      merchantAccount: config.merchantAccount,
      environment: config.environment,
    });

    appContextContainer.set({ adyenEnv: config.environment === "live" ? "LIVE" : "TEST" });

    const adyen = createAdyenClient({
      apiKey: config.apiKeyEncrypted,
      environment: config.environment,
    });

    const pspReference = transaction.pspReference;
    const adyenAmount = resolveAdyenAmount({
      amount: saleorMoney.amount,
      currency: saleorMoney.currency,
    });

    try {
      // 节点 3｜调 Adyen 前
      logger.info("Calling Adyen refundCapturedPayment", {
        originalPspReference: pspReference,
        merchantAccount: config.merchantAccount,
        amountMinorUnits: adyenAmount.value,
        currency: adyenAmount.currency,
      });

      const refundResponse = await withTimeout<any>(
        adyen.modificationsApi.refundCapturedPayment(pspReference, {
          merchantAccount: config.merchantAccount,
          amount: adyenAmount,
          // Saleor 的幂等键，便于在 Adyen 后台按退款请求反查（最长 80 字符，UUID 刚好）
          reference: event.idempotencyKey,
        }),
        ADYEN_TIMEOUT_MS,
        "Adyen refundCapturedPayment",
      );

      // 退款单自己的 psp，不是原始扣款的 pspReference：Saleor 用它对 REFUND_REQUEST / REFUND_SUCCESS 配对
      const refundPspReference: string | null = refundResponse?.pspReference ?? null;
      const adyenStatus: unknown = refundResponse?.status;
      const statusKind = resolveAdyenRefundStatus(adyenStatus);

      // 节点 4｜Adyen 响应
      logger.info("Adyen refund response", {
        adyenStatus,
        statusKind,
        refundPspReference,
        originalPspReference: pspReference,
        amount: saleorMoney.amount,
        currency: saleorMoney.currency,
      });

      if (!refundPspReference) {
        logger.error("Adyen did not return a refund pspReference", { adyenStatus });
        return ok(
          new TransactionRefundRequestedUseCaseResponses.Failure({
            amount: saleorMoney,
            message: "Adyen refund response has no pspReference",
            appContext,
          }),
        );
      }

      // 节点 5｜三态决策
      if (statusKind === "failed") {
        logger.warn("Adyen rejected the refund, replying REFUND_FAILURE", {
          adyenStatus,
          refundPspReference,
        });
        return ok(
          new TransactionRefundRequestedUseCaseResponses.Failure({
            pspReference: refundPspReference,
            amount: saleorMoney,
            message: `Adyen refund status: ${String(adyenStatus)}`,
            appContext,
          }),
        );
      }

      if (statusKind === "completed") {
        logger.info("Refund settled synchronously, replying REFUND_SUCCESS", {
          refundPspReference,
        });
        return ok(
          new TransactionRefundRequestedUseCaseResponses.Success({
            pspReference: refundPspReference,
            amount: saleorMoney,
            appContext,
          }),
        );
      }

      logger.info("Refund accepted but not settled, replying REFUND_REQUEST", {
        adyenStatus,
        refundPspReference,
      });
      return ok(
        new TransactionRefundRequestedUseCaseResponses.Pending({
          pspReference: refundPspReference,
          amount: saleorMoney,
          appContext,
        }),
      );
    } catch (error) {
      // 节点 6｜异常
      logger.error("Adyen refund request failed", {
        error: error instanceof Error ? error.message : String(error),
        originalPspReference: pspReference,
        amount: saleorMoney.amount,
        currency: saleorMoney.currency,
      });

      return ok(
        new TransactionRefundRequestedUseCaseResponses.Failure({
          amount: saleorMoney,
          message: error instanceof Error ? error.message : "Refund failed",
          appContext,
        }),
      );
    }
  }
}
