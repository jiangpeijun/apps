// apps/adyen/src/modules/app-config/trpc-handlers/new-adyen-config-trpc-handler.ts
import { TRPCError } from "@trpc/server";
import { captureException } from "@sentry/nextjs";

import { BaseError } from "@/lib/errors";
import { RandomId } from "@/lib/random-id";
import { newAdyenConfigInputSchema } from "@/modules/app-config/trpc-handlers/new-adyen-config-input-schema";
import { createSaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { protectedClientProcedure } from "@/modules/trpc/protected-client-procedure";
import { type AdyenConfig } from "../domain/adyen-config";

export class NewAdyenConfigTrpcHandler {
  baseProcedure = protectedClientProcedure;

  getTrpcProcedure() {
    return this.baseProcedure.input(newAdyenConfigInputSchema).mutation(async ({ input, ctx }) => {
      const saleorApiUrl = createSaleorApiUrl(ctx.saleorApiUrl);

      if (saleorApiUrl.isErr()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Malformed request",
        });
      }

      if (!ctx.appUrl) {
        captureException(new BaseError("Missing appUrl in TRPC request"));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong, please contact support.",
        });
      }

      const configId = new RandomId().generate();

      // 直接构造符合 AdyenConfig interface 的对象
      const configToSave: AdyenConfig = {
        id: configId,
        name: input.name,
        merchantAccount: input.merchantAccount,
        apiKeyEncrypted: input.apiKey, // 注意：实际生产中应使用加密服务
        hmacKeyEncrypted: input.hmacKey, // 注意：实际生产中应使用加密服务
        clientKey: input.clientKey,
        environment: input.clientKey.startsWith("live_") ? "live" : "test",
        storefrontUrl: process.env.APP_IFRAME_BASE_URL || "http://localhost:3001",
        channelSlugs: [],
        saleorApiUrl: ctx.saleorApiUrl,
        token: ctx.appToken,
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
          message: "Failed to create Adyen configuration. Data can't be saved.",
        });
      }
    });
  }
}