// apps/adyen/src/app/api/webhooks/saleor/transaction-cancelation-requested/route.ts
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
import { TransactionCancelationRequestedUseCase, readCancelAction } from "./use-case";
import { transactionCancelationRequestedWebhookDefinition } from "./webhook-definition";

const useCase = new TransactionCancelationRequestedUseCase({
  appConfigRepo: appConfigRepoImpl,
});

const logger = createLogger("TRANSACTION_CANCELATION_REQUESTED route");

const readResponseKind = (response: unknown): string => {
  if (typeof response === "object" && response !== null && "kind" in response) {
    const kind = (response as { kind?: unknown }).kind;

    return typeof kind === "string" ? kind : "UNKNOWN";
  }

  return "UNKNOWN";
};

const handler = transactionCancelationRequestedWebhookDefinition.createHandler(
  withRecipientVerification(async (_req, ctx) => {
    const requestStartedAt = Date.now();

    try {
      const transaction = ctx.payload.transaction;
      const action = readCancelAction(ctx.payload);
      const channelSlug =
        transaction?.checkout?.channel.slug ?? transaction?.order?.channel.slug ?? null;

      setObservabilitySourceObjectId({
        __typename: transaction?.checkout?.id ? "Checkout" : "Order",
        id: transaction?.checkout?.id ?? transaction?.order?.id ?? null,
      });

      loggerContext.set(
        ObservabilityAttributes.PSP_REFERENCE,
        transaction?.pspReference ?? null,
      );

      // 节点 1｜收到请求
      logger.info("Received cancelation request", {
        idempotencyKey: ctx.payload.idempotencyKey,
        transactionId: transaction?.id ?? null,
        originalPspReference: transaction?.pspReference ?? null,
        channelSlug,
        amount: action?.amount ?? null,
        currency: action?.currency ?? null,
      });

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
      logger.info("Dispatching cancelation to use case", {
        appId: ctx.authData.appId,
        saleorApiUrl: saleorApiUrlResult.value,
        saleorVersion: ctx.payload.version,
      });

      const result = await useCase.execute({
        appId: ctx.authData.appId,
        saleorApiUrl: saleorApiUrlResult.value,
        event: ctx.payload,
      });

      // 节点 3｜结果
      return result.match(
        (success) => {
          logger.info("Cancelation request finished", {
            result: readResponseKind(success),
            httpsStatusCode: success.statusCode,
            durationMs: Date.now() - requestStartedAt,
          });
          return success.getResponse();
        },
        (failure) => {
          logger.warn("Cancelation request rejected", {
            result: readResponseKind(failure),
            httpsStatusCode: failure.statusCode,
            reason: "message" in failure ? String(failure.message) : undefined,
            durationMs: Date.now() - requestStartedAt,
          });
          return failure.getResponse();
        },
      );
    } catch (error) {
      logger.error("Unhandled error in cancelation route", {
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
