// apps/adyen/src/app/api/webhooks/saleor/transaction-process-session/route.ts
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
import { TransactionProcessSessionUseCase } from "./use-case";
import { transactionProcessSessionWebhookDefinition } from "./webhook-definition";

const useCase = new TransactionProcessSessionUseCase({
  appConfigRepo: appConfigRepoImpl,
});

const logger = createLogger("TRANSACTION_PROCESS_SESSION route");

const handler = transactionProcessSessionWebhookDefinition.createHandler(
  withRecipientVerification(async (_req, ctx) => {
    try {
      // 👈 使用 (ctx.payload.transaction as any) 绕过未重新生成的类型限制
      const txId = (ctx.payload.transaction as any)?.id || "unknown";
      console.log(`\n🔥 [ProcessSession Route] 收到请求, TxId: ${txId}`);

      setObservabilitySourceObjectId(ctx.payload.sourceObject);

      loggerContext.set(
        ObservabilityAttributes.TRANSACTION_AMOUNT,
        ctx.payload.action.amount ?? null,
      );

      const saleorApiUrlResult = createSaleorApiUrl(ctx.authData.saleorApiUrl);

      if (saleorApiUrlResult.isErr()) {
        console.error(`❌ [ProcessSession Route] URL 解析失败`);
        captureException(saleorApiUrlResult.error);
        const response = new MalformedRequestResponse(
          appContextContainer.getContextValue(),
          saleorApiUrlResult.error,
        );
        return response.getResponse();
      }

      const schemaVersionString = ctx.schemaVersion ? String(ctx.schemaVersion) : "3.23";
      setObservabilitySaleorApiUrl(saleorApiUrlResult.value, schemaVersionString);

      const result = await useCase.execute({
        appId: ctx.authData.appId,
        saleorApiUrl: saleorApiUrlResult.value,
        event: ctx.payload,
      });

      return result.match(
        (successResult) => {
          console.log(`✅ [ProcessSession Route] UseCase 处理成功, HTTP ${successResult.statusCode}`);
          return successResult.getResponse();
        },
        (errorResult) => {
          console.warn(`⚠️ [ProcessSession Route] UseCase 处理失败(非500):`, (errorResult as any).message);
          return errorResult.getResponse();
        },
      );
    } catch (error) {
      console.error(`💥💥💥 [ProcessSession Route] 致命异常 (500):`, error);
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