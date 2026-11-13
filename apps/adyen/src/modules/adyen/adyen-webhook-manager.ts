import { captureException } from "@sentry/nextjs";
import { err, ok, type Result } from "neverthrow";
import Adyen from "adyen";

import { WebhookParams } from "@/app/api/webhooks/adyen/webhook-params";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { type NewAdyenConfigInput } from "@/modules/app-config/trpc-handlers/new-adyen-config-input-schema";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { AdyenClient } from "@/modules/adyen/adyen-client";
import { type AdyenRestrictedKey } from "@/modules/adyen/adyen-restricted-key";
import { AdyenWebhookUrlBuilder } from "@/modules/adyen/adyen-webhook-url-builder";
import { supportedAdyenEvents } from "@/modules/adyen/supported-adyen-events";

import { ADYEN_API_VERSION } from "./adyen-api-version";

const CantCreateWebhookUrlError = BaseError.subclass("CantCreateWebhookUrlError", {
  props: {
    _internalName: "AdyenWebhookManagerErrors.CantCreateWebhookUrlError" as const,
  },
});

const InvalidDataError = BaseError.subclass("InvalidDataError", {
  props: {
    _internalName: "AdyenWebhookManagerErrors.InvalidDataError" as const,
  },
});

const CantCreateWebhookError = BaseError.subclass("CantCreateWebhookError", {
  props: {
    _internalName: "AdyenWebhookManagerErrors.CantCreateWebhookError" as const,
  },
});

const CantRemoveWebhookError = BaseError.subclass("CantRemoveWebhookError", {
  props: {
    _internalName: "AdyenWebhookManagerErrors.CantRemoveWebhookError" as const,
  },
});

const CantFetchWebhookError = BaseError.subclass("CantFetchWebhookError", {
  props: {
    _internalName: "AdyenWebhookManagerErrors.CantFetchWebhookError" as const,
  },
});

const CantUpdateWebhookError = BaseError.subclass("CantUpdateWebhookError", {
  props: {
    _internalName: "AdyenWebhookManagerErrors.CantUpdateWebhookError" as const,
  },
});

export const AdyenWebhookManagerErrors = {
  CantCreateWebhookUrlError,
  CantCreateWebhookError,
  CantRemoveWebhookError,
  CantFetchWebhookError,
  CantUpdateWebhookError,
};

const buildWebhookDescription = (configName: string) =>
  `Created by Saleor App Payment Adyen, config name: ${configName}`;

export class AdyenWebhookManager {
  private logger = createLogger("AdyenWebhookManager");
  private urlBuilder = new AdyenWebhookUrlBuilder();

  async getWebhook({
    webhookId,
    restrictedKey,
  }: {
    webhookId: string;
    restrictedKey: AdyenRestrictedKey;
  }) {
    try {
      const client = AdyenClient.createFromRestrictedKey(restrictedKey);

      const webhook = await client.nativeClient.webhookEndpoints.retrieve(webhookId);

      return ok({
        status: webhook.status as "enabled" | "disabled",
      });
    } catch (e) {
      this.logger.warn("Error retrieving webhook", { error: e });

      return err(new CantFetchWebhookError("Error retrieving webhook", { cause: e }));
    }
  }

  /**
   * Tells whether the webhook created for a configuration is still reachable with the given
   * restricted key. Used when keys are rotated: a key from another Adyen account (or another
   * mode) cannot see the endpoint, so a new one has to be created.
   *
   * Only a missing resource resolves to `false`. Any other failure is returned as an error,
   * because recreating a webhook on a transient Adyen error would leave two endpoints pushing
   * the same events, and only one of them matching the stored signing secret.
   */
  async isWebhookReachableWithKey({
    webhookId,
    restrictedKey,
  }: {
    webhookId: string;
    restrictedKey: AdyenRestrictedKey;
  }): Promise<
    Result<boolean, InstanceType<typeof AdyenWebhookManagerErrors.CantFetchWebhookError>>
  > {
    try {
      const client = AdyenClient.createFromRestrictedKey(restrictedKey);

      await client.nativeClient.webhookEndpoints.retrieve(webhookId);

      return ok(true);
    } catch (e) {
      if (e instanceof Adyen.errors.AdyenInvalidRequestError && e.code === "resource_missing") {
        this.logger.info("Webhook not found for given restricted key", { webhookId });

        return ok(false);
      }

      this.logger.warn("Error checking if webhook is reachable", { error: e });

      return err(new CantFetchWebhookError("Error retrieving webhook", { cause: e }));
    }
  }

  async updateWebhookDescription({
    webhookId,
    restrictedKey,
    configName,
  }: {
    webhookId: string;
    restrictedKey: AdyenRestrictedKey;
    configName: string;
  }) {
    try {
      const client = AdyenClient.createFromRestrictedKey(restrictedKey);

      await client.nativeClient.webhookEndpoints.update(webhookId, {
        description: buildWebhookDescription(configName),
      });

      return ok(null);
    } catch (e) {
      this.logger.warn("Error updating webhook description", { error: e });

      return err(new CantUpdateWebhookError("Error updating webhook", { cause: e }));
    }
  }

  async removeWebhook({
    webhookId,
    restrictedKey,
  }: {
    webhookId: string;
    restrictedKey: AdyenRestrictedKey;
  }) {
    try {
      const client = AdyenClient.createFromRestrictedKey(restrictedKey);

      await client.nativeClient.webhookEndpoints.del(webhookId);

      this.logger.info("Successfully removed Adyen webhook", { id: webhookId });

      return ok(null);
    } catch (e) {
      this.logger.warn("Error removing webhook", { error: e });

      return err(new CantRemoveWebhookError("Error removing webhook", { cause: e }));
    }
  }

  async createWebhook(
    config: NewAdyenConfigInput & {
      configurationId: string;
    },
    { appUrl, saleorApiUrl, appId }: { appUrl: string; saleorApiUrl: SaleorApiUrl; appId: string },
  ): Promise<
    Result<
      {
        secret: string;
        id: string;
      },
      InstanceType<
        | typeof AdyenWebhookManagerErrors.CantCreateWebhookUrlError
        | typeof AdyenWebhookManagerErrors.CantCreateWebhookError
      >
    >
  > {
    this.logger.debug("Will create Adyen webhook");
    const client = AdyenClient.createFromRestrictedKey(config.restrictedKey);

    const webhookUrl = this.urlBuilder.buildUrl({
      appUrl,
      webhookParams: WebhookParams.createFromParams({
        saleorApiUrl: saleorApiUrl,
        configurationId: config.configurationId,
        appId,
      }),
    });

    if (webhookUrl.isErr()) {
      captureException(
        new CantCreateWebhookUrlError("Failed to build URL", {
          cause: webhookUrl.error,
        }),
      );

      return err(new CantCreateWebhookUrlError("Cant create URL"));
    }

    this.logger.debug("Resolved webhook url", {
      webhookUrl,
    });

    try {
      const result = await client.nativeClient.webhookEndpoints.create({
        url: webhookUrl.value.toString(),
        description: buildWebhookDescription(config.name),
        enabled_events: supportedAdyenEvents,
        metadata: {
          saleorAppConfigurationId: config.configurationId,
        },
        api_version: ADYEN_API_VERSION,
      });

      const { secret, id } = result;

      this.logger.info("Successfully created Adyen webhook", { id });

      if (!secret) {
        /**
         * According to docs, secret is optional, because it's only returned on creation.
         * Here we create it, so it must be there
         * If not, this is Panic
         */
        throw new InvalidDataError(
          "Adyen did not return secret from webhook. This should not happen",
        );
      }

      return ok({ secret, id });
    } catch (e) {
      this.logger.warn("Error creating webhook", { error: e });

      if (e instanceof InvalidDataError) {
        captureException(e);

        return err(new CantCreateWebhookError("Result from Adyen was unexpected"));
      }

      // todo handle exact errors
      return err(
        new CantCreateWebhookError("Error creating webhook", {
          cause: e,
        }),
      );
    }
  }
}
