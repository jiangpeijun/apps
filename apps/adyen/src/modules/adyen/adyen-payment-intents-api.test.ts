import { describe, expect, it, vi } from "vitest";

import { mockedSaleorTransactionId } from "@/__tests__/mocks/constants";
import { mockedStripeRestrictedKey } from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { StripeClient } from "@/modules/adyen/adyen-client";
import { StripeMoney } from "@/modules/adyen/adyen-money";

import { StripePaymentIntentsApi } from "./adyen-payment-intents-api";

describe("StripePaymentIntentsApi", () => {
  describe("createPaymentIntent", () => {
    it("Calls inner Stripe SDK with expected params", async () => {
      const clientWrapper = StripeClient.createFromRestrictedKey(mockedStripeRestrictedKey);
      const instance = StripePaymentIntentsApi.createFromClient(clientWrapper);

      vi.spyOn(clientWrapper.nativeClient.paymentIntents, "create").mockResolvedValue(
        // @ts-expect-error - in this test we dont care about the response
        {},
      );

      await instance.createPaymentIntent({
        idempotencyKey: "IK",
        stripeMoney: StripeMoney.createFromSaleorAmount({
          amount: 12.34,
          currency: "USD",
        })._unsafeUnwrap(),
        metadata: {
          saleor_source_id: "checkout-id",
          saleor_source_type: "Checkout",
          saleor_transaction_id: mockedSaleorTransactionId,
        },
        intentParams: {
          automatic_payment_methods: { enabled: true },
          payment_method_options: {
            klarna: {
              capture_method: "manual",
            },
          },
        },
      });

      expect(clientWrapper.nativeClient.paymentIntents.create).toHaveBeenCalledExactlyOnceWith(
        {
          amount: 1234,
          automatic_payment_methods: {
            enabled: true,
          },
          currency: "usd",
          metadata: {
            saleor_source_id: "checkout-id",
            saleor_source_type: "Checkout",
            saleor_transaction_id: mockedSaleorTransactionId,
          },
          payment_method_options: {
            klarna: {
              capture_method: "manual",
            },
          },
        },
        { idempotencyKey: "IK" },
      );
    });

    it("Calls inner Stripe SDK without metadata when not provided", async () => {
      const clientWrapper = StripeClient.createFromRestrictedKey(mockedStripeRestrictedKey);
      const instance = StripePaymentIntentsApi.createFromClient(clientWrapper);

      vi.spyOn(clientWrapper.nativeClient.paymentIntents, "create").mockResolvedValue(
        // @ts-expect-error - in this test we dont care about the response
        {},
      );

      await instance.createPaymentIntent({
        idempotencyKey: "IK",
        stripeMoney: StripeMoney.createFromSaleorAmount({
          amount: 12.34,
          currency: "USD",
        })._unsafeUnwrap(),
        intentParams: {
          automatic_payment_methods: { enabled: true },
        },
      });

      expect(clientWrapper.nativeClient.paymentIntents.create).toHaveBeenCalledExactlyOnceWith(
        {
          amount: 1234,
          automatic_payment_methods: {
            enabled: true,
          },
          currency: "usd",
        },
        { idempotencyKey: "IK" },
      );
    });
  });

  describe("createFromKey", () => {
    it("creates instance of StripePaymentIntentsApi", () => {
      const api = StripePaymentIntentsApi.createFromKey({ key: mockedStripeRestrictedKey });

      expect(api).toBeInstanceOf(StripePaymentIntentsApi);
    });
  });
});
