import type Adyen from "adyen";
import { describe, expect, it, vi } from "vitest";

import { mockedAdyenRestrictedKeyTest } from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { AdyenAuthValidator } from "@/modules/adyen/adyen-auth-validator";
import { AdyenClient } from "@/modules/adyen/adyen-client";

describe("AdyenAuthValidator", () => {
  describe("validateAdyenAuth", () => {
    /**
     * This is not perfect - for example WRITE to intents may be not possible.
     * However, this is UX-check only. It's documented which permissions should be provided to app.
     * If they are invalid, payments will not work.
     */
    it("Return ok if provided Adyen instance has access to paymentIntents (READ)", async () => {
      const adyen = AdyenClient.createFromRestrictedKey(mockedAdyenRestrictedKeyTest);

      vi.spyOn(adyen.nativeClient.paymentIntents, "list").mockImplementationOnce(() => {
        return Promise.resolve() as unknown as Adyen.ApiListPromise<Adyen.PaymentIntent>;
      });

      const instance = AdyenAuthValidator.createFromClient(adyen);

      const result = await instance.validateAdyenAuth();

      expect(result.isOk()).toBe(true);
    });

    it("Return AuthError if Payment Intents (READ) permission is missing", async () => {
      const adyen = AdyenClient.createFromRestrictedKey(mockedAdyenRestrictedKeyTest);

      vi.spyOn(adyen.nativeClient.paymentIntents, "list").mockImplementationOnce(() => {
        return Promise.reject(
          new Error("Test Error"),
        ) as unknown as Adyen.ApiListPromise<Adyen.PaymentIntent>;
      });

      const instance = AdyenAuthValidator.createFromClient(adyen);

      const result = await instance.validateAdyenAuth();

      expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
        [AdyenAuthValidator.AuthError: Test Error
        Failed to authorize with Adyen]
      `);
    });
  });
});
