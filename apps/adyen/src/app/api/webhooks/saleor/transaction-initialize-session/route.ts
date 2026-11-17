// apps/adyen/src/app/api/webhooks/saleor/transaction-initialize-session/route.ts
import { ObservabilityAttributes } from "@saleor/apps-otel/src/observability-attributes";
import { withSpanAttributesAppRouter } from "@saleor/apps-otel/src/with-span-attributes";
import { compose } from "@saleor/apps-shared/compose";
import { captureException } from "@sentry/nextjs";

import { MalformedRequestResponse, UnhandledErrorResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { loggerContext, withLoggerContext } from "@/lib/logger-context";
import { setObservabilitySaleorApiUrl } from "@/lib/observability-saleor-api-url";
import { setObservabilitySourceObjectId } from "@/lib/observability-source-object-id";
import { appConfigRepoImpl } from "@/modules/app-config/repositories/app-config-repo-impl";
import { createSaleorApiUrl } from "@/modules/saleor/saleor-api-url";

import { withRecipientVerification } from "../with-recipient-verification";
import { TransactionInitializeSessionUseCase } from "./use-case";
import { transactionInitializeSessionWebhookDefinition } from "./webhook-definition";

const useCase = new TransactionInitializeSessionUseCase({
  appConfigRepo: appConfigRepoImpl,
});

const logger = createLogger("TRANSACTION_INITIALIZE_SESSION route");

const handler = transactionInitializeSessionWebhookDefinition.createHandler(
  withRecipientVerification(async (_req, ctx) => {
    try {
      console.log(`\n🔥 [Route] 收到请求: TransactionId=${ctx.payload.transaction.id}`);
      console.log(`🔥 [Route] ctx.authData.saleorApiUrl: ${ctx.authData.saleorApiUrl}`);
      console.log(`🔥 [Route] ctx.schemaVersion: ${ctx.schemaVersion || 'undefined'}`);

      setObservabilitySourceObjectId(ctx.payload.sourceObject);
      loggerContext.set(ObservabilityAttributes.TRANSACTION_AMOUNT, ctx.payload.action.amount ?? null);

      const saleorApiUrlResult = createSaleorApiUrl(ctx.authData.saleorApiUrl);
      if (saleorApiUrlResult.isErr()) {
        console.error(`❌ [Route] Saleor API URL 解析失败`);
        captureException(saleorApiUrlResult.error);
        return new MalformedRequestResponse(appContextContainer.getContextValue(), saleorApiUrlResult.error).getResponse();
      }

      // 👈 修复：强制转换为 string，并给一个默认值兼容
      const schemaVersionString = ctx.schemaVersion ? String(ctx.schemaVersion) : "3.23";
      
      // 现在传入的是纯 string，不会再报类型错误
      setObservabilitySaleorApiUrl(saleorApiUrlResult.value, schemaVersionString);

      const result = await useCase.execute({
        appId: ctx.authData.appId,
        saleorApiUrl: saleorApiUrlResult.value,
        event: ctx.payload,
        token: ctx.authData.token,
      });

      return result.match(
        (successResult) => {
          console.log(`✅ [Route] UseCase 处理成功, HTTP ${successResult.statusCode}`);
          return successResult.getResponse();
        },
        (errorResult) => {
          console.warn(`⚠️ [Route] UseCase 处理失败(非500):`, errorResult.message);
          return errorResult.getResponse();
        },
      );
    } catch (error) {
      console.error(`💥💥💥 [Route] 捕获到致命异常 (500):`, error);
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