import { describe, expect, it } from "vitest";

import { createAdyenPaymentIntentId } from "./adyen-payment-intent-id";

describe("createAdyenPaymentIntentId", () => {
  it("should successfully create Adyen payment intent id when valid", () => {
    const result = createAdyenPaymentIntentId("pi_valid123");

    expect(result).toBe("pi_valid123");
  });

  it("should return error when payment intent id is empty", () => {
    expect(() => createAdyenPaymentIntentId("")).toThrowError();
  });

  it("should NOT return error when payment intent id does not start with pi_", () => {
    // Do not break the flow, but Sentry will be called
    expect(() => createAdyenPaymentIntentId("invalid123")).not.toThrow();
  });

  it("shouldn't be assignable without createAdyenPaymentIntentId", () => {
    // @ts-expect-error - if this fails - it means the type is not branded
    const testValue: AdyenPaymentIntentIdType = "";

    expect(testValue).toBe("");
  });
});
