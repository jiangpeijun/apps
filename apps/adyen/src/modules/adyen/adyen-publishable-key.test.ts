import { describe, expect, it } from "vitest";

import {
  createAdyenPublishableKey,
  AdyenPublishableKeyValidationError,
} from "./adyen-publishable-key";

describe("AdyenPublishableKey", () => {
  describe("createFromUserInput", () => {
    it("should create instance for valid test key", () => {
      const result = createAdyenPublishableKey("pk_test_valid123");

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe("pk_test_valid123");
    });

    it("should create instance for valid live key", () => {
      const result = createAdyenPublishableKey("pk_live_valid456");

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe("pk_live_valid456");
    });

    it("should accepted potentially invalid key, even if format is not expected", () => {
      const result = createAdyenPublishableKey("invalid_key");

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe("invalid_key");
    });

    it("should return error if key is empty", () => {
      const result = createAdyenPublishableKey("");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(AdyenPublishableKeyValidationError);
      expect(result._unsafeUnwrapErr().message).toMatchInlineSnapshot(`
        "ZodError: [
          {
            "code": "too_small",
            "minimum": 1,
            "type": "string",
            "inclusive": true,
            "exact": false,
            "message": "String must contain at least 1 character(s)",
            "path": []
          }
        ]"
      `);
    });
  });
});
