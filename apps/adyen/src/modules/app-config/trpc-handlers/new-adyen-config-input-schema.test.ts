import { describe, expect, it } from "vitest";

import { mockedAdyenPublishableKey } from "@/__tests__/mocks/mocked-adyen-publishable-key";
import { mockedAdyenRestrictedKey } from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { newAdyenConfigInputSchema } from "@/modules/app-config/trpc-handlers/new-adyen-config-input-schema";

describe("newAdyenConfigInputSchema", () => {
  it("Properly parses valid input", () => {
    expect(
      newAdyenConfigInputSchema.parse({
        name: "test",
        restrictedKey: mockedAdyenRestrictedKey,
        publishableKey: mockedAdyenPublishableKey,
      }),
    ).toStrictEqual({
      name: "test",
      restrictedKey: mockedAdyenRestrictedKey,
      publishableKey: mockedAdyenPublishableKey,
    });
  });

  it("Returns list of errors for invalid input", () => {
    expect(() =>
      newAdyenConfigInputSchema.parse({
        name: "",
        restrictedKey: "test",
        publishableKey: "",
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
        },
        {
          "message": "Invalid Publishable Key format. Must start with 'pk_test_' or 'pk_live_'.",
          "code": "custom",
          "fatal": true,
          "path": [
            "publishableKey"
          ]
        },
        {
          "message": "Invalid Restricted Key format. Must start with 'rk_test_' or 'rk_live_'.",
          "code": "custom",
          "fatal": true,
          "path": [
            "restrictedKey"
          ]
        }
      ]]
    `);
  });

  it("Returns custom error if TEST and LIVE keys are mixed", () => {
    expect(() =>
      newAdyenConfigInputSchema.parse({
        name: "test",
        restrictedKey: "rk_live_asd",
        publishableKey: "pk_test_asd",
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
});
