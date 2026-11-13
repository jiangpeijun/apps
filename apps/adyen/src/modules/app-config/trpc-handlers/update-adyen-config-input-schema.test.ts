import { describe, expect, it } from "vitest";

import { mockedConfigurationId } from "@/__tests__/mocks/constants";
import {
  mockedAdyenPublishableKey,
  mockedAdyenPublishableKeyTest,
} from "@/__tests__/mocks/mocked-adyen-publishable-key";
import {
  mockedAdyenRestrictedKey,
  mockedAdyenRestrictedKeyTest,
} from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { updateAdyenConfigInputSchema } from "@/modules/app-config/trpc-handlers/update-adyen-config-input-schema";

describe("updateAdyenConfigInputSchema", () => {
  it("Accepts a full key pair from the same environment", () => {
    expect(
      updateAdyenConfigInputSchema.parse({
        configId: mockedConfigurationId,
        name: "Renamed",
        publishableKey: mockedAdyenPublishableKey,
        restrictedKey: mockedAdyenRestrictedKey,
      }),
    ).toStrictEqual({
      configId: mockedConfigurationId,
      name: "Renamed",
      publishableKey: mockedAdyenPublishableKey,
      restrictedKey: mockedAdyenRestrictedKey,
    });
  });

  it("Accepts a full test key pair", () => {
    expect(
      updateAdyenConfigInputSchema.parse({
        configId: mockedConfigurationId,
        name: "Sandbox",
        publishableKey: mockedAdyenPublishableKeyTest,
        restrictedKey: mockedAdyenRestrictedKeyTest,
      }),
    ).toMatchObject({
      publishableKey: mockedAdyenPublishableKeyTest,
      restrictedKey: mockedAdyenRestrictedKeyTest,
    });
  });

  it("Accepts null restrictedKey so the stored key is kept", () => {
    expect(
      updateAdyenConfigInputSchema.parse({
        configId: mockedConfigurationId,
        name: "Renamed",
        publishableKey: mockedAdyenPublishableKey,
        restrictedKey: null,
      }),
    ).toMatchObject({
      restrictedKey: null,
    });
  });

  it("Rejects an empty name", () => {
    expect(() =>
      updateAdyenConfigInputSchema.parse({
        configId: mockedConfigurationId,
        name: "",
        publishableKey: mockedAdyenPublishableKey,
        restrictedKey: null,
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "code": "too_small",
          "minimum": 1,
          "type": "string",
          "inclusive": true,
          "exact": false,
          "message": "String must contain at least 1 character(s)",
          "path": [
            "name"
          ]
        }
      ]]
    `);
  });

  it("Rejects mixing live and test keys when a new restricted key is provided", () => {
    expect(() =>
      updateAdyenConfigInputSchema.parse({
        configId: mockedConfigurationId,
        name: "Renamed",
        publishableKey: mockedAdyenPublishableKeyTest,
        restrictedKey: mockedAdyenRestrictedKey,
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "code": "custom",
          "message": "Both Publishable and Restricted Keys must be live or test",
          "path": []
        }
      ]]
    `);
  });

  it("Does not require environment matching when the restricted key is kept", () => {
    /**
     * Env matching against the *stored* key is enforced in the handler, not here — null means
     * "keep", so the schema only validates the publishable key format.
     */
    expect(
      updateAdyenConfigInputSchema.parse({
        configId: mockedConfigurationId,
        name: "Renamed",
        publishableKey: mockedAdyenPublishableKeyTest,
        restrictedKey: null,
      }),
    ).toMatchObject({
      publishableKey: mockedAdyenPublishableKeyTest,
      restrictedKey: null,
    });
  });
});
