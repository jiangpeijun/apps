import { err, ok, type Result } from "neverthrow";

import { BaseError } from "@/lib/errors";
import { type AdyenEnv } from "@/modules/adyen/adyen-env";
import { type AdyenPublishableKey } from "@/modules/adyen/adyen-publishable-key";
import { type AdyenRestrictedKey } from "@/modules/adyen/adyen-restricted-key";
import { type AdyenWebhookSecret } from "@/modules/adyen/adyen-webhook-secret";

export class AdyenConfig {
  readonly name: string;
  readonly id: string;
  readonly restrictedKey: AdyenRestrictedKey;
  readonly publishableKey: AdyenPublishableKey;
  readonly webhookSecret: AdyenWebhookSecret;
  readonly webhookId: string;

  static ValidationError = BaseError.subclass("ValidationError", {
    props: {
      _internalName: "AdyenConfig.ValidationError" as const,
    },
  });

  private constructor(props: {
    name: string;
    id: string;
    restrictedKey: AdyenRestrictedKey;
    publishableKey: AdyenPublishableKey;
    webhookSecret: AdyenWebhookSecret;
    webhookId: string;
  }) {
    this.name = props.name;
    this.id = props.id;
    this.restrictedKey = props.restrictedKey;
    this.publishableKey = props.publishableKey;
    this.webhookSecret = props.webhookSecret;
    this.webhookId = props.webhookId;
  }

  getAdyenEnvValue(): AdyenEnv {
    return this.publishableKey.startsWith("pk_test") ? "TEST" : "LIVE";
  }

  static create(args: {
    name: string;
    id: string;
    webhookSecret: AdyenWebhookSecret;
    webhookId: string;
    restrictedKey: AdyenRestrictedKey;
    publishableKey: AdyenPublishableKey;
  }): Result<AdyenConfig, InstanceType<typeof AdyenConfig.ValidationError>> {
    if (args.name.length === 0) {
      return err(new AdyenConfig.ValidationError("Config name cannot be empty"));
    }

    if (args.id.length === 0) {
      return err(new AdyenConfig.ValidationError("Config id cannot be empty"));
    }

    const isPkTest = args.publishableKey.startsWith("pk_test");
    const isPkLive = args.publishableKey.startsWith("pk_live");
    const isRkTest = args.restrictedKey.startsWith("rk_test");
    const isRkLive = args.restrictedKey.startsWith("rk_live");

    const isBothTest = isRkTest && isPkTest;
    const isBothLive = isRkLive && isPkLive;

    const isBothTestOrLive = isBothTest || isBothLive;

    if (!isBothTestOrLive) {
      return err(
        new AdyenConfig.ValidationError(
          "Publishable key and restricted key must be of the same environment - TEST or LIVE",
        ),
      );
    }

    return ok(
      new AdyenConfig({
        name: args.name,
        id: args.id,
        restrictedKey: args.restrictedKey,
        publishableKey: args.publishableKey,
        webhookSecret: args.webhookSecret,
        webhookId: args.webhookId,
      }),
    );
  }
}

export type AdyenFrontendConfigSerializedFields = {
  readonly name: string;
  readonly id: string;
  readonly restrictedKey: string;
  readonly publishableKey: string;
  readonly webhookStatus?: "missing" | "disabled" | "active";
};

/**
 * Safe class that only returns whats permitted to the UI.
 * It also allows to serialize and deserialize itself, so it can be easily transported via tRPC
 */
export class AdyenFrontendConfig implements AdyenFrontendConfigSerializedFields {
  readonly name: string;
  readonly id: string;
  readonly restrictedKey: string;
  readonly publishableKey: string;
  webhookStatus?: AdyenFrontendConfigSerializedFields["webhookStatus"];

  private constructor(fields: AdyenFrontendConfigSerializedFields) {
    this.name = fields.name;
    this.id = fields.id;
    this.restrictedKey = fields.restrictedKey;
    this.publishableKey = fields.publishableKey;
    this.webhookStatus = fields.webhookStatus;
  }

  private static getMaskedKeyValue(key: AdyenRestrictedKey) {
    return `...${key.slice(-4)}`;
  }

  getAdyenEnvValue() {
    return this.publishableKey.startsWith("pk_test") ? "TEST" : "LIVE";
  }

  static createFromAdyenConfig(adyenConfig: AdyenConfig) {
    return new AdyenFrontendConfig({
      name: adyenConfig.name,
      id: adyenConfig.id,
      publishableKey: adyenConfig.publishableKey,
      restrictedKey: this.getMaskedKeyValue(adyenConfig.restrictedKey),
    });
  }

  static createFromSerializedFields(fields: AdyenFrontendConfigSerializedFields) {
    return new AdyenFrontendConfig(fields);
  }
}
