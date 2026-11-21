// apps/adyen/src/app/api/webhooks/saleor/transaction-cancelation-requested/use-case.ts
import { err, ok, type Result } from "neverthrow";

import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
  MalformedRequestResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type TransactionCancelationRequestedEventFragment } from "@/generated/graphql";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { ADYEN_TIMEOUT_MS, withTimeout } from "@/modules/adyen/adyen-timeout";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";

import {
  TransactionCancelationRequestedUseCaseResponses,
  type SaleorMoney,
  type TransactionCancelationRequestedUseCaseResponsesType,
} from "./use-case-response";

type UseCaseExecuteResult = Result<
  TransactionCancelationRequestedUseCaseResponsesType,
  AppIsNotConfiguredResponse | BrokenAppResponse | MalformedRequestResponse
>;

const logger = createLogger("TransactionCancelationRequestedUseCase");

/**
 * Saleor 3.23 的 TransactionCancelationRequested 没有 event.amount，
 * 金额只在 action.amount（3.21 起填充用户请求金额，未指定时回填 authorizedAmount）。
 * 这里用结构断言而不是直接 event.action，是为了兼容「订阅已补、但 generate:adyen 还没跑」
 * 的中间状态，避免 ts(2339) 卡 IDE。
 */
type CancelActionShape = { amount: number; currency: string };

export const readCancelAction = (
  event: TransactionCancelationRequestedEventFragment,
): CancelActionShape | null => {
  return (event as unknown as { action?: CancelActionShape | null }).action ?? null;
};

/**
 * Adyen 的取消是同步操作：status=received 即已被受理。
 * 但接口也可能 HTTP 200 却返回 refused/failed——这时必须回 CANCEL_FAILURE，
 * 否则 Saleor 会把 authorizedAmount 扣掉，而 Adyen 侧资金仍被占用。
 */
const resolveAdyenCancelOutcome = (status: unknown): "accepted" | "refused" => {
  const normalized = String(status ?? "").toLowerCase();

  if (
    normalized.includes("refus") ||
    normalized.includes("fail") ||
    normalized.includes("error")
  ) {
    return "refused";
  }

  return "accepted";
};

export class TransactionCancelationRequestedUseCase {
  private appConfigRepo: AppConfigRepo;

  constructor(deps: { appConfigRepo: AppConfigRepo }) {
    this.appConfigRepo = deps.appConfigRepo;
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionCancelationRequestedEventFragment;
  }): Promise<UseCaseExecuteResult> {
    const { appId, saleorApiUrl, event } = args;
    const appContext = appContextContainer.getContextValue();
    const transaction = event.transaction;

    const action = readCancelAction(event);
    const cancelMoney: SaleorMoney | null =
      action && Number(action.amount) > 0
        ? { amount: action.amount, currency: action.currency }
        : null;

    // 节点 1｜入口
    logger.info("Cancel use case started", {
      appId,
      idempotencyKey: event.idempotencyKey,
      transactionId: transaction?.id ?? null,
      originalPspReference: transaction?.pspReference ?? null,
      amount: cancelMoney?.amount ?? null,
      currency: cancelMoney?.currency ?? null,
    });

    if (!cancelMoney) {
      logger.warn(
        "Cancel amount is unavailable, response will omit amount and let Saleor fall back",
        { idempotencyKey: event.idempotencyKey },
      );
    }

    if (!transaction) {
      logger.error("Transaction is missing in the cancelation payload", {
        idempotencyKey: event.idempotencyKey,
      });
      return err(
        new MalformedRequestResponse(appContext, new BaseError("Transaction is missing")),
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

    try {
      // 节点 3｜调 Adyen 前
      logger.info("Calling Adyen cancelAuthorisedPaymentByPspReference", {
        originalPspReference: pspReference,
        merchantAccount: config.merchantAccount,
      });

      const cancelResponse = await withTimeout<{
        pspReference?: string;
        status?: string;
      }>(
        adyen.modificationsApi.cancelAuthorisedPaymentByPspReference(pspReference, {
          merchantAccount: config.merchantAccount,
        }),
        ADYEN_TIMEOUT_MS,
        "Adyen cancelAuthorisedPaymentByPspReference",
      );

      // 取消操作自己的 psp：Saleor 用它把 CANCEL_SUCCESS 与 CANCEL_REQUEST 配对，
      // 配对成功才会扣 cancelPendingAmount，否则会直接动 authorizedAmount。
      const cancelPspReference = cancelResponse?.pspReference ?? null;
      const adyenStatus = cancelResponse?.status;
      const outcome = resolveAdyenCancelOutcome(adyenStatus);

      // 节点 4｜Adyen 响应
      logger.info("Adyen cancel response", {
        adyenStatus,
        outcome,
        cancelPspReference,
        originalPspReference: pspReference,
      });

      if (outcome === "refused") {
        logger.warn("Adyen refused the cancelation, replying CANCEL_FAILURE", {
          adyenStatus,
          cancelPspReference,
        });
        return ok(
          new TransactionCancelationRequestedUseCaseResponses.Failure({
            pspReference: cancelPspReference,
            amount: cancelMoney,
            message: `Adyen cancel status: ${String(adyenStatus)}`,
            appContext,
          }),
        );
      }

      if (!cancelPspReference) {
        logger.warn("Adyen cancel response has no pspReference, falling back to original one", {
          adyenStatus,
        });
      }

      // 节点 5｜成功决策
      logger.info("Cancelation accepted, replying CANCEL_SUCCESS", {
        cancelPspReference: cancelPspReference ?? pspReference,
        amount: cancelMoney?.amount ?? null,
        currency: cancelMoney?.currency ?? null,
      });

      return ok(
        new TransactionCancelationRequestedUseCaseResponses.Success({
          pspReference: cancelPspReference ?? pspReference,
          amount: cancelMoney,
          appContext,
        }),
      );
    } catch (error) {
      // 节点 6｜异常
      const errorMessage = error instanceof Error ? error.message : "Adyen cancel failed";

      logger.error("Adyen cancel request failed", {
        error: errorMessage,
        originalPspReference: pspReference,
        amount: cancelMoney?.amount ?? null,
        currency: cancelMoney?.currency ?? null,
      });

      return ok(
        new TransactionCancelationRequestedUseCaseResponses.Failure({
          amount: cancelMoney,
          message: errorMessage,
          appContext,
        }),
      );
    }
  }
}
