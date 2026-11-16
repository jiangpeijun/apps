// apps/adyen/src/modules/app-config/trpc-handlers/get-adyen-configs-channels-mapping-trpc-handler.ts
import { TRPCError } from "@trpc/server";

import { AdyenFrontendConfig } from "@/modules/app-config/domain/adyen-config";
import { createSaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { protectedClientProcedure } from "@/modules/trpc/protected-client-procedure";

export class GetAdyenConfigsChannelsMappingTrpcHandler {
  baseProcedure = protectedClientProcedure;

  getTrpcProcedure() {
    return this.baseProcedure.query(async ({ ctx }) => {
      const saleorApiUrl = createSaleorApiUrl(ctx.saleorApiUrl);

      if (saleorApiUrl.isErr()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Malformed request",
        });
      }

      const configResult = await ctx.configRepo.getRootConfig({
        saleorApiUrl: saleorApiUrl.value,
        appId: ctx.appId,
      });

      if (configResult.isErr()) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch configurations, try again",
        });
      }

      const rootConfig = configResult.value as any;
      
      // 暴力遍历获取 mapping 和 configs，防止属性名不一致
      let mapping: Record<string, string> = {};
      let configsMap: Record<string, any> = {};
      
      for (const key of Object.keys(rootConfig)) {
        const val = rootConfig[key];
        if (val && typeof val === 'object' && !Array.isArray(val)) {
           // 如果里面的 value 是 string（比如 channelId -> configId），说明这是 mapping
           if (Object.values(val).every(v => typeof v === 'string')) {
             mapping = val;
           } else {
             // 否则是 configs 记录
             configsMap = val;
           }
        }
      }
      
      // 如果暴力遍历没找到，用旧名字兜底
      if (Object.keys(mapping).length === 0) mapping = rootConfig.channelConfigMapping || {};
      if (Object.keys(configsMap).length === 0) configsMap = rootConfig.adyenConfigsById || rootConfig.configsById || rootConfig.configs || {};

      const result: Record<string, AdyenFrontendConfig> = {};
      
      for (const [channelId, configId] of Object.entries(mapping)) {
        const config = configsMap[configId as string];
        if (config) {
          result[channelId] = AdyenFrontendConfig.createFromSerializedFields({
            id: config.id,
            name: config.name,
            environment: config.environment,
            clientKey: config.clientKey,
            channelSlugs: config.channelSlugs,
            webhookStatus: "active",
          });
        }
      }
      
      return result;
    });
  }
}