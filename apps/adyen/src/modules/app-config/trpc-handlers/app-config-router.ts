import { GetSaleorChannelsTrpcHandler } from "@/modules/app-config/trpc-handlers/get-saleor-channels-trpc-handler";
import { GetAdyenConfigsChannelsMappingTrpcHandler } from "@/modules/app-config/trpc-handlers/get-adyen-configs-channels-mapping-trpc-handler";
import { GetAdyenConfigsListTrpcHandler } from "@/modules/app-config/trpc-handlers/get-adyen-configs-list-trpc-handler";
import { NewAdyenConfigTrpcHandler } from "@/modules/app-config/trpc-handlers/new-adyen-config-trpc-handler";
import { RemoveAdyenConfigTrpcHandler } from "@/modules/app-config/trpc-handlers/remove-adyen-config-trpc-handler";
import { UpdateMappingTrpcHandler } from "@/modules/app-config/trpc-handlers/update-mapping-trpc-handler";
import { UpdateAdyenConfigTrpcHandler } from "@/modules/app-config/trpc-handlers/update-adyen-config-trpc-handler";
import { ChannelsFetcher } from "@/modules/saleor/channel-fetcher";
import { AdyenWebhookManager } from "@/modules/adyen/adyen-webhook-manager";
import { router } from "@/modules/trpc/trpc-server";

const webhookManager = new AdyenWebhookManager();

/**
 * TODO Figure out end-to-end router testing (must somehow check valid jwt token)
 */
export const appConfigRouter = router({
  saveNewAdyenConfig: new NewAdyenConfigTrpcHandler({
    webhookManager,
  }).getTrpcProcedure(),
  getAdyenConfigsList: new GetAdyenConfigsListTrpcHandler().getTrpcProcedure(),
  fetchChannels: new GetSaleorChannelsTrpcHandler({
    channelsFetcherFactory: (client) => new ChannelsFetcher(client),
  }).getTrpcProcedure(),
  channelsConfigsMapping: new GetAdyenConfigsChannelsMappingTrpcHandler().getTrpcProcedure(),
  updateMapping: new UpdateMappingTrpcHandler().getTrpcProcedure(),
  updateAdyenConfig: new UpdateAdyenConfigTrpcHandler({ webhookManager }).getTrpcProcedure(),
  removeAdyenConfig: new RemoveAdyenConfigTrpcHandler({ webhookManager }).getTrpcProcedure(),
});
