// apps/adyen/src/modules/app-config/trpc-handlers/get-adyen-configs-list-trpc-handler.ts
import { TRPCError } from "@trpc/server";

import { AdyenFrontendConfig } from "@/modules/app-config/domain/adyen-config";
import { createSaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { protectedClientProcedure } from "@/modules/trpc/protected-client-procedure";

export class GetAdyenConfigsListTrpcHandler {
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

      const config = await ctx.configRepo.getRootConfig({
        saleorApiUrl: saleorApiUrl.value,
        appId: ctx.appId,
      });

      if (config.isErr()) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "App failed to fetch config, please contact Saleor",
        });
      }

      const rootConfig = config.value as any;
      
      let mapping: Record<string, string> = {};
      let configsMap: Record<string, any> = {};
      
      for (const key of Object.keys(rootConfig)) {
        const val = rootConfig[key];
        if (val && typeof val === 'object' && !Array.isArray(val)) {
           if (Object.values(val).every(v => typeof v === 'string')) {
             mapping = val;
           } else {
             configsMap = val;
           }
        }
      }
      
      if (Object.keys(mapping).length === 0) mapping = rootConfig.channelConfigMapping || {};
      if (Object.keys(configsMap).length === 0) configsMap = rootConfig.adyenConfigsById || rootConfig.configsById || rootConfig.configs || {};
      
      const configsList = Object.values(configsMap);

      const results = configsList.map((configItem: any) => {
        // 核心修复：找出绑定了该 configId 的所有 channelId
        const assignedChannelIds = Object.entries(mapping)
          .filter(([_, cId]) => cId === configItem.id)
          .map(([channelId]) => channelId);

        return AdyenFrontendConfig.createFromSerializedFields({
          id: configItem.id,
          name: configItem.name,
          environment: configItem.environment,
          clientKey: configItem.clientKey,
          channelSlugs: assignedChannelIds, // 塞入已绑定的 channelIds
          webhookStatus: "active", 
        });
      });

      return results;
    });
  }
}