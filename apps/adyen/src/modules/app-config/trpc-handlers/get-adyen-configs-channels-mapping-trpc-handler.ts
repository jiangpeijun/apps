import { TRPCError } from "@trpc/server";

import {
  AdyenFrontendConfig,
  type AdyenFrontendConfigSerializedFields,
} from "@/modules/app-config/domain/adyen-config";
import { createSaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { protectedClientProcedure } from "@/modules/trpc/protected-client-procedure";

// todo test
export class GetAdyenConfigsChannelsMappingTrpcHandler {
  baseProcedure = protectedClientProcedure;

  getTrpcProcedure() {
    return this.baseProcedure.query(
      async ({ ctx }): Promise<Record<string, AdyenFrontendConfigSerializedFields>> => {
        const saleorApiUrl = createSaleorApiUrl(ctx.saleorApiUrl);

        /**
         * TODO: Extract such logic to be shared between handlers
         * TODO CTX should have already created SaleorApiUrl instance, not Result
         */
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

        const mapping = config.value.chanelConfigMapping;
        const allConfigs = config.value.adyenConfigsById;

        return Object.entries(mapping).reduce(
          (acc, [channelID, configId]) => {
            const config = allConfigs[configId];

            if (config) {
              acc[channelID] = AdyenFrontendConfig.createFromAdyenConfig(config);
            }

            return acc;
          },
          {} as Record<string, AdyenFrontendConfigSerializedFields>,
        );
      },
    );
  }
}
