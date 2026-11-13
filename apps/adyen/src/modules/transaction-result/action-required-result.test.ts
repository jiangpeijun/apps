import { describe, expect, it } from "vitest";

import { createAdyenPaymentIntentStatus } from "@/modules/adyen/adyen-payment-intent-status";

import {
  AuthorizationActionRequiredResult,
  ChargeActionRequiredResult,
} from "./action-required-result";

describe("ChargeActionRequiredResult", () => {
  it.each([
    { adyenStatus: "requires_action", expectedMessage: "Payment intent requires action" },
    {
      adyenStatus: "requires_confirmation",
      expectedMessage: "Payment intent requires confirmation",
    },
    {
      adyenStatus: "requires_payment_method",
      expectedMessage: "Payment intent requires payment method",
    },
  ])(
    "should create instance with message: $expectedMessage for Adyen status:$adyenStatus",
    ({ adyenStatus, expectedMessage }) => {
      const result = new ChargeActionRequiredResult(createAdyenPaymentIntentStatus(adyenStatus));

      expect(result.message).toBe(expectedMessage);
    },
  );

  it("should throw error for unsupported status", () => {
    expect(() => {
      new ChargeActionRequiredResult(createAdyenPaymentIntentStatus("succeeded"));
    }).toThrow(
      "Payment intent status succeeded is not supported for CHARGE_ACTION_REQUIRED transaction flow",
    );
  });
});

describe("AuthorizationActionRequiredResult", () => {
  it.each([
    { adyenStatus: "requires_action", expectedMessage: "Payment intent requires action" },
    {
      adyenStatus: "requires_confirmation",
      expectedMessage: "Payment intent requires confirmation",
    },
    {
      adyenStatus: "requires_payment_method",
      expectedMessage: "Payment intent requires payment method",
    },
  ])(
    "should create instance with message: $expectedMessage for Adyen status:$adyenStatus",
    ({ adyenStatus, expectedMessage }) => {
      const result = new AuthorizationActionRequiredResult(
        createAdyenPaymentIntentStatus(adyenStatus),
      );

      expect(result.message).toBe(expectedMessage);
    },
  );

  it("should throw error for unsupported status", () => {
    expect(() => {
      new AuthorizationActionRequiredResult(createAdyenPaymentIntentStatus("succeeded"));
    }).toThrow(
      "Payment intent status succeeded is not supported for AUTHORIZATION_ACTION_REQUIRED transaction flow",
    );
  });
});
