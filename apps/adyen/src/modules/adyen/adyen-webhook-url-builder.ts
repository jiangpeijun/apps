import { err, ok } from "neverthrow";

import { WebhookParams } from "@/app/api/webhooks/adyen/webhook-params";
import { BaseError } from "@/lib/errors";

/**
 * Builds URL which Adyen will reach
 *
 * Consider merging with WebhookParams, maybe it can be single class like AdyenWebhookUrl
 */
export class AdyenWebhookUrlBuilder {
  buildUrl({ appUrl, webhookParams }: { appUrl: string; webhookParams: WebhookParams }) {
    try {
      const webhookUrl = new URL(appUrl + "/api/webhooks/adyen");

      webhookUrl.searchParams.set(
        WebhookParams.configurationIdIdSearchParam,
        webhookParams.configurationId,
      );
      webhookUrl.searchParams.set(
        WebhookParams.saleorApiUrlSearchParam,
        webhookParams.saleorApiUrl,
      );
      webhookUrl.searchParams.set(WebhookParams.appIdSearchParam, webhookParams.appId);

      return ok(webhookUrl.toString());
    } catch (e) {
      return err(
        new BaseError("Cant build URL", {
          cause: e,
        }),
      );
    }
  }
}
