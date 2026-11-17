// apps/adyen/src/app/api/webhooks/saleor/payment-gateway-initialize-session/route.ts
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
import { withLoggerContext } from "@/lib/logger-context";
import { setObservabilitySaleorApiUrl } from "@/lib/observability-saleor-api-url";
import { setObservabilitySourceObjectId } from "@/lib/observability-source-object-id";
import { appConfigRepoImpl } from "@/modules/app-config/repositories/app-config-repo-impl";
import { createSaleorApiUrl } from "@/modules/saleor/saleor-api-url";

import { withRecipientVerification } from "../with-recipient-verification";
import { PaymentGatewayInitializeSessionUseCase } from "./use-case";
import { paymentGatewayInitializeSessionWebhookDefinition } from "./webhook-definition";

const useCase = new PaymentGatewayInitializeSessionUseCase({
  appConfigRepo: appConfigRepoImpl,
});

const logger = createLogger("PAYMENT_GATEWAY_INITIALIZE_SESSION route");

const handler = paymentGatewayInitializeSessionWebhookDefinition.createHandler(
  withRecipientVerification(async (_req, ctx) => {
    try {
      setObservabilitySourceObjectId(ctx.payload.sourceObject);

      logger.info("Received webhook request");

      const saleorApiUrlResult = createSaleorApiUrl(ctx.authData.saleorApiUrl);

      if (saleorApiUrlResult.isErr()) {
        const response = new MalformedRequestResponse(
          appContextContainer.getContextValue(),
          saleorApiUrlResult.error,
        );

        captureException(saleorApiUrlResult.error);

        return response.getResponse();
      }

      setObservabilitySaleorApiUrl(saleorApiUrlResult.value, ctx.payload.version);
      console.log("🔥 [route.ts] 准备调用 useCase.execute, Payload 如下:", ctx.payload);

      let result;
      try {
        result = await useCase.execute({
          channelId: ctx.payload.sourceObject.channel.id,
          appId: ctx.authData.appId,
          saleorApiUrl: saleorApiUrlResult.value,
          event: ctx.payload, 
        });
        console.log("🔥 [route.ts] useCase.execute 执行完毕");
      } catch (err) {
        console.error("💥 [route.ts] useCase.execute 直接抛出异常:", err);
        throw err; // 抛给外层 catch
      }

      return result.match(
        (result) => {
          logger.info("Successfully processed webhook request", { httpsStatusCode: result.statusCode });
          return result.getResponse();
        },
        (err) => {
          console.error("💥 [route.ts] useCase 返回了 Err 对象:", err);
          logger.warn("Failed to process webhook request", { httpsStatusCode: err.statusCode, reason: err.message });
          return err.getResponse();
        },
      );
    } catch (error) {
      captureException(error);
      logger.error("Unhandled error", { error: error });

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