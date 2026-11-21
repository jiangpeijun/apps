// apps\adyen\src\app\api\webhooks\saleor\transaction-refund-requested\route.ts
import { ObservabilityAttributes } from "@saleor/apps-otel/src/observability-attributes";
import { withSpanAttributesAppRouter } from "@saleor/apps-otel/src/with-span-attributes";
import { compose } from "@saleor/apps-shared/compose";
import { captureException } from "@sentry/nextjs";

import {
  MalformedRequestResponse,
  UnhandledErrorResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { loggerContext, withLoggerContext } from "@/lib/logger-context";
import { setObservabilitySaleorApiUrl } from "@/lib/observability-saleor-api-url";
import { setObservabilitySourceObjectId } from "@/lib/observability-source-object-id";
import { appConfigRepoImpl } from "@/modules/app-config/repositories/app-config-repo-impl";
import { createSaleorApiUrl } from "@/modules/saleor/saleor-api-url";

import { withRecipientVerification } from "../with-recipient-verification";
import { TransactionRefundRequestedUseCase } from "./use-case";
import { type RefundPayloadLike, resolveRefundMoney } from "./use-case-response";
import { transactionRefundRequestedWebhookDefinition } from "./webhook-definition";

const useCase = new TransactionRefundRequestedUseCase({
  appConfigRepo: appConfigRepoImpl,
});

const logger = createLogger("TRANSACTION_REFUND_REQUESTED route");

/**
 * execute() 的返回联合类型还包含 MalformedRequestResponse / AppBrokenResponse 等
 * 不带 kind 的响应类，所以这里用 "kind" in 品牌化收窄，而不是强转。
 */
const readResponseKind = (response: unknown): string => {
  if (typeof response === "object" && response !== null && "kind" in response) {
    const kind = (response as { kind?: unknown }).kind;

    return typeof kind === "string" ? kind : "UNKNOWN";
  }

  return "UNKNOWN";
};

const handler = transactionRefundRequestedWebhookDefinition.createHandler(
  withRecipientVerification(async (_req, ctx) => {
    const requestStartedAt = Date.now();

    try {
      const transaction = ctx.payload.transaction;
      const refundMoney = resolveRefundMoney(ctx.payload as unknown as RefundPayloadLike);
      const channelSlug =
        transaction?.checkout?.channel.slug ?? transaction?.order?.channel.slug ?? null;

      setObservabilitySourceObjectId({
        __typename: transaction?.checkout?.id ? "Checkout" : "Order",
        id: transaction?.checkout?.id ?? transaction?.order?.id ?? null,
      });

      // 这里是「原始扣款」的 pspReference：调 Adyen /payments/{psp}/refunds 用它。
      // 回给 Saleor 的 pspReference 必须是退款单自己的 psp，两者不能混。
      loggerContext.set(
        ObservabilityAttributes.PSP_REFERENCE,
        transaction?.pspReference ?? null,
      );

      // 节点 1｜收到请求
      logger.info("Received refund request", {
        idempotencyKey: ctx.payload.idempotencyKey,
        transactionId: transaction?.id ?? null,
        originalPspReference: transaction?.pspReference ?? null,
        orderNumber: transaction?.order?.number ?? null,
        channelSlug,
        refundAmount: refundMoney?.amount ?? null,
        refundCurrency: refundMoney?.currency ?? null,
      });

      if (!refundMoney) {
        logger.warn("Refund amount is missing in payload", {
          hasAction: Boolean((ctx.payload as unknown as RefundPayloadLike).action),
        });
      }

      const saleorApiUrlResult = createSaleorApiUrl(ctx.authData.saleorApiUrl);

      if (saleorApiUrlResult.isErr()) {
        logger.error("Malformed saleorApiUrl in auth data", {
          error: saleorApiUrlResult.error.message,
        });
        captureException(saleorApiUrlResult.error);
        const response = new MalformedRequestResponse(
          appContextContainer.getContextValue(),
          saleorApiUrlResult.error,
        );
        return response.getResponse();
      }

      setObservabilitySaleorApiUrl(saleorApiUrlResult.value, ctx.payload.version);

      // 节点 2｜派发给 use case
      logger.info("Dispatching refund to use case", {
        appId: ctx.authData.appId,
        saleorApiUrl: saleorApiUrlResult.value,
        saleorVersion: ctx.payload.version,
      });

      const result = await useCase.execute({
        appId: ctx.authData.appId,
        saleorApiUrl: saleorApiUrlResult.value,
        event: ctx.payload,
      });

      // 节点 3｜use case 给出结果
      return result.match(
        (success) => {
          logger.info("Refund request finished", {
            result: readResponseKind(success),
            httpsStatusCode: success.statusCode,
            durationMs: Date.now() - requestStartedAt,
          });
          return success.getResponse();
        },
        (failure) => {
          logger.warn("Refund request rejected", {
            result: readResponseKind(failure),
            httpsStatusCode: failure.statusCode,
            reason: "message" in failure ? String(failure.message) : undefined,
            durationMs: Date.now() - requestStartedAt,
          });
          return failure.getResponse();
        },
      );
    } catch (error) {
      logger.error("Unhandled error in refund route", {
        error: BaseError.normalize(error).message,
        durationMs: Date.now() - requestStartedAt,
      });
      captureException(error);
      const response = new UnhandledErrorResponse(
        appContextContainer.getContextValue(),
        BaseError.normalize(error),
      );
      return response.getResponse();
    }
  }),
);

export const POST = compose(
  withLoggerContext,
  appContextContainer.wrapRequest,
  withSpanAttributesAppRouter,
)(handler);
