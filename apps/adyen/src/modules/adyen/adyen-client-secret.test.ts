import { describe, expect, it } from "vitest";

import {
  createAdyenClientSecret,
  type AdyenClientSecret,
  AdyenClientSecretValidationError,
} from "./adyen-client-secret";

describe("createAdyenClientSecret", () => {
  it("should successfully create client secret when valid", () => {
    const result = createAdyenClientSecret("pi_valid_secret_123_secret_456");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe("pi_valid_secret_123_secret_456");
  });

  it("should return error when client secret is null", () => {
    const result = createAdyenClientSecret(null);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(AdyenClientSecretValidationError);
  });

  it("should return error when client secret is empty", () => {
    const result = createAdyenClientSecret("");

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(AdyenClientSecretValidationError);
  });

  it("shouldn't be assignable without createAdyenClientSecret", () => {
    // @ts-expect-error - if this fails - it means the type is not branded
    const testValue: AdyenClientSecret = "";

    expect(testValue).toBe("");
  });
});
