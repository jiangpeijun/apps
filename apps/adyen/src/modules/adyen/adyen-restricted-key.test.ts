import { describe, expect, it } from "vitest";

import {
  createAdyenRestrictedKey,
  type AdyenRestrictedKey,
  AdyenRestrictedKeyValidationError,
} from "./adyen-restricted-key";

describe("AdyenRestrictedKey", () => {
  describe("createFromUserInput", () => {
    it("should create instance for valid test key", () => {
      const result = createAdyenRestrictedKey("rk_test_valid123");

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe("rk_test_valid123");
    });

    it("should create instance for valid live key", () => {
      const result = createAdyenRestrictedKey("rk_live_valid456");

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe("rk_live_valid456");
    });

    it("should return error if key is empty", () => {
      const result = createAdyenRestrictedKey("");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(AdyenRestrictedKeyValidationError);
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

    it("Nominal typing works", () => {
      const fn = (v: AdyenRestrictedKey) => v;

      // @ts-expect-error - should be error, only string must be accepted
      fn("rk_test_XXX");

      expect(() => fn(createAdyenRestrictedKey("rk_test_XXX")._unsafeUnwrap())).not.toThrow();
    });
  });
});
