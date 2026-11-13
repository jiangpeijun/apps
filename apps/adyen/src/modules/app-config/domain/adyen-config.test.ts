import { describe, expect, it } from "vitest";

import { mockedConfigurationId } from "@/__tests__/mocks/constants";
import { mockedAdyenConfig } from "@/__tests__/mocks/mock-adyen-config";
import {
  mockedAdyenPublishableKey,
  mockedAdyenPublishableKeyTest,
} from "@/__tests__/mocks/mocked-adyen-publishable-key";
import {
  mockedAdyenRestrictedKey,
  mockedAdyenRestrictedKeyTest,
} from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { mockAdyenWebhookSecret } from "@/__tests__/mocks/adyen-webhook-secret";

import { AdyenConfig, AdyenFrontendConfig } from "./adyen-config";

describe("AdyenConfig", () => {
  it("should create a valid config", () => {
    const result = AdyenConfig.create({
      name: "Test Config",
      id: "test-config-1",
      publishableKey: mockedAdyenPublishableKey,
      restrictedKey: mockedAdyenRestrictedKey,
      webhookSecret: mockAdyenWebhookSecret,
      webhookId: mockAdyenWebhookSecret,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().name).toBe("Test Config");
    expect(result._unsafeUnwrap().id).toBe("test-config-1");
    expect(result._unsafeUnwrap().publishableKey).toBe(mockedAdyenPublishableKey);
    expect(result._unsafeUnwrap().restrictedKey).toBe(mockedAdyenRestrictedKey);
  });

  it("should return error for empty name", () => {
    const result = AdyenConfig.create({
      name: "",
      id: "test-config-1",
      publishableKey: mockedAdyenPublishableKey,
      restrictedKey: mockedAdyenRestrictedKey,
      webhookSecret: mockAdyenWebhookSecret,
      webhookId: mockAdyenWebhookSecret,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(AdyenConfig.ValidationError);
    expect(result._unsafeUnwrapErr().message).toBe("Config name cannot be empty");
  });

  it("should return error for empty id", () => {
    const result = AdyenConfig.create({
      name: "Test Config",
      id: "",
      publishableKey: mockedAdyenPublishableKey,
      restrictedKey: mockedAdyenRestrictedKey,
      webhookSecret: mockAdyenWebhookSecret,
      webhookId: mockAdyenWebhookSecret,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(AdyenConfig.ValidationError);
    expect(result._unsafeUnwrapErr().message).toBe("Config id cannot be empty");
  });

  it("Should return error when PK and RK have mixed live/test prefixes", () => {
    const instance1 = AdyenConfig.create({
      name: "Test Config",
      id: "test-config-1",
      publishableKey: mockedAdyenPublishableKeyTest,
      restrictedKey: mockedAdyenRestrictedKey,
      webhookSecret: mockAdyenWebhookSecret,
      webhookId: mockAdyenWebhookSecret,
    })._unsafeUnwrapErr();

    const instance2 = AdyenConfig.create({
      name: "Test Config",
      id: "test-config-1",
      publishableKey: mockedAdyenPublishableKey,
      restrictedKey: mockedAdyenRestrictedKeyTest,
      webhookSecret: mockAdyenWebhookSecret,
      webhookId: mockAdyenWebhookSecret,
    })._unsafeUnwrapErr();

    expect(instance1).toMatchInlineSnapshot(
      `[ValidationError: Publishable key and restricted key must be of the same environment - TEST or LIVE]`,
    );

    expect(instance2).toMatchInlineSnapshot(
      `[ValidationError: Publishable key and restricted key must be of the same environment - TEST or LIVE]`,
    );
  });
});

describe("AdyenFrontendConfig", () => {
  it("Creates from Adyen Config and sets expected data", () => {
    const frontendConfig = AdyenFrontendConfig.createFromAdyenConfig(mockedAdyenConfig);

    expect(frontendConfig.id).toStrictEqual(mockedAdyenConfig.id);
    expect(frontendConfig.name).toStrictEqual(mockedAdyenConfig.name);
    expect(frontendConfig.publishableKey).toStrictEqual(mockedAdyenConfig.publishableKey);

    // Ensure RK is masked
    expect(frontendConfig.restrictedKey).toMatchInlineSnapshot(`"...GGGG"`);
  });

  it("Serializes and deserializes from itself", () => {
    const frontendConfig = AdyenFrontendConfig.createFromAdyenConfig(mockedAdyenConfig);

    const serialized = JSON.stringify(frontendConfig);

    /**
     * Ensure serialized data doesn't have secrets!
     */
    expect(serialized).toMatchInlineSnapshot(
      `"{"name":"config-name","id":"81f323bd-91e2-4838-ab6e-5affd81ffc3b","restrictedKey":"...GGGG","publishableKey":"pk_live_1"}"`,
    );

    //@ts-expect-error - JSON is arbitrary
    const parsedBack = AdyenFrontendConfig.createFromSerializedFields(JSON.parse(serialized));

    expect(parsedBack.id).toStrictEqual(mockedAdyenConfig.id);
    expect(parsedBack.name).toStrictEqual(mockedAdyenConfig.name);
    expect(parsedBack.publishableKey).toStrictEqual(mockedAdyenConfig.publishableKey);

    // Ensure RK is masked
    expect(parsedBack.restrictedKey).toMatchInlineSnapshot(`"...GGGG"`);
  });

  it("Returns TEST and LIVE information about the config", () => {
    const testConfig = AdyenFrontendConfig.createFromSerializedFields({
      name: "Test",
      id: mockedConfigurationId,
      publishableKey: mockedAdyenPublishableKeyTest,
      restrictedKey: mockedAdyenRestrictedKeyTest,
    });

    const liveConfig = AdyenFrontendConfig.createFromSerializedFields({
      name: "Test",
      id: mockedConfigurationId,
      publishableKey: mockedAdyenPublishableKey,
      restrictedKey: mockedAdyenRestrictedKey,
    });

    expect(testConfig.getAdyenEnvValue()).toBe("TEST");
    expect(liveConfig.getAdyenEnvValue()).toBe("LIVE");
  });
});
