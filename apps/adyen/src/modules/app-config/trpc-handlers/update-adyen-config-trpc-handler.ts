// apps/adyen/src/modules/app-config/trpc-handlers/update-adyen-config-trpc-handler.ts
import { TRPCError } from "@trpc/server";
import { captureException } from "@sentry/nextjs";

import { BaseError } from "@/lib/errors";
import { updateAdyenConfigInputSchema } from "@/modules/app-config/trpc-handlers/update-adyen-config-input-schema";
import { createSaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { protectedClientProcedure } from "@/modules/trpc/protected-client-procedure";
import { type AdyenConfig } from "@/modules/app-config/domain/adyen-config";

export class UpdateAdyenConfigTrpcHandler {
  baseProcedure = protectedClientProcedure;

  getTrpcProcedure() {
    return this.baseProcedure.input(updateAdyenConfigInputSchema).mutation(async ({ input, ctx }) => {
      const saleorApiUrl = createSaleorApiUrl(ctx.saleorApiUrl);

      if (saleorApiUrl.isErr()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Malformed request" });
      }

      if (!ctx.appUrl) {
        captureException(new BaseError("Missing appUrl in TRPC request"));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong." });
      }

      const configResult = await ctx.configRepo.getAdyenConfig({
        configId: input.configId,
        appId: ctx.appId,
        saleorApiUrl: saleorApiUrl.value,
      });

      if (configResult.isErr() || !configResult.value) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Config not found, please refresh the page and try again.",
        });
      }

      // 👇 核心修复：强制断言类型
      const existingConfig = configResult.value as AdyenConfig;

      const configToSave: AdyenConfig = {
        ...existingConfig,
        name: input.name,
        merchantAccount: input.merchantAccount,
        apiKeyEncrypted: input.apiKey,
        hmacKeyEncrypted: input.hmacKey,
        clientKey: input.clientKey,
        environment: input.clientKey.startsWith("live_") ? "live" : "test",
      };

      const saveResult = await ctx.configRepo.saveAdyenConfig({
        config: configToSave,
        saleorApiUrl: saleorApiUrl.value,
        appId: ctx.appId,
      });

      if (saveResult.isErr()) {
        captureException(saveResult.error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update Adyen configuration. Data can't be saved.",
        });
      }
    });
  }
}