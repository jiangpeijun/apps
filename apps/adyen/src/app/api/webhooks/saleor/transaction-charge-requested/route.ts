// apps/adyen/src/app/api/webhooks/saleor/transaction-charge-requested/route.ts
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
import { TransactionChargeRequestedUseCase } from "./use-case";
import { transactionChargeRequestedWebhookDefinition } from "./webhook-definition";

const useCase = new TransactionChargeRequestedUseCase({
  appConfigRepo: appConfigRepoImpl,
});

const logger = createLogger("TRANSACTION_CHARGE_REQUESTED route");

const handler = transactionChargeRequestedWebhookDefinition.createHandler(
  withRecipientVerification(async (_req, ctx) => {
    try {
      const txId = ctx.payload.transaction?.id || "unknown";
      console.log(`\n🔥 [Charge Route] 收到请求, TxId: ${txId}`);

      setObservabilitySourceObjectId({
        __typename: ctx.payload.transaction?.checkout?.id ? "Checkout" : "Order",
        id: ctx.payload.transaction?.checkout?.id ?? ctx.payload.transaction?.order?.id ?? null,
      });

      loggerContext.set(
        ObservabilityAttributes.PSP_REFERENCE,
        ctx.payload.transaction?.pspReference ?? null,
      );

      const saleorApiUrlResult = createSaleorApiUrl(ctx.authData.saleorApiUrl);

      if (saleorApiUrlResult.isErr()) {
        console.error(`❌ [Charge Route] URL 解析失败`);
        captureException(saleorApiUrlResult.error);
        const response = new MalformedRequestResponse(
          appContextContainer.getContextValue(),
          saleorApiUrlResult.error,
        );
        return response.getResponse();
      }

      // 👈 兼容 schemaVersion 缺失
      const schemaVersionString = ctx.schemaVersion ? String(ctx.schemaVersion) : "3.23";
      setObservabilitySaleorApiUrl(saleorApiUrlResult.value, schemaVersionString);

      const result = await useCase.execute({
        appId: ctx.authData.appId,
        saleorApiUrl: saleorApiUrlResult.value,
        event: ctx.payload,
      });

      return result.match(
        (result) => {
          console.log(`✅ [Charge Route] UseCase 处理成功, HTTP ${result.statusCode}`);
          return result.getResponse();
        },
        (err) => {
          console.warn(`⚠️ [Charge Route] UseCase 处理失败(非500):`, err.message);
          return err.getResponse();
        },
      );
    } catch (error) {
      console.error(`💥💥💥 [Charge Route] 捕获到致命异常 (500):`, error);
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