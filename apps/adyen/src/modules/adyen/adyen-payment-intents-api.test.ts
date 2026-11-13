import { describe, expect, it, vi } from "vitest";

import { mockedSaleorTransactionId } from "@/__tests__/mocks/constants";
import { mockedAdyenRestrictedKey } from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { AdyenClient } from "@/modules/adyen/adyen-client";
import { AdyenMoney } from "@/modules/adyen/adyen-money";

import { AdyenPaymentIntentsApi } from "./adyen-payment-intents-api";

describe("AdyenPaymentIntentsApi", () => {
  describe("createPaymentIntent", () => {
    it("Calls inner Adyen SDK with expected params", async () => {
      const clientWrapper = AdyenClient.createFromRestrictedKey(mockedAdyenRestrictedKey);
      const instance = AdyenPaymentIntentsApi.createFromClient(clientWrapper);

      vi.spyOn(clientWrapper.nativeClient.paymentIntents, "create").mockResolvedValue(
        // @ts-expect-error - in this test we dont care about the response
        {},
      );

      await instance.createPaymentIntent({
        idempotencyKey: "IK",
        adyenMoney: AdyenMoney.createFromSaleorAmount({
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

    it("Calls inner Adyen SDK without metadata when not provided", async () => {
      const clientWrapper = AdyenClient.createFromRestrictedKey(mockedAdyenRestrictedKey);
      const instance = AdyenPaymentIntentsApi.createFromClient(clientWrapper);

      vi.spyOn(clientWrapper.nativeClient.paymentIntents, "create").mockResolvedValue(
        // @ts-expect-error - in this test we dont care about the response
        {},
      );

      await instance.createPaymentIntent({
        idempotencyKey: "IK",
        adyenMoney: AdyenMoney.createFromSaleorAmount({
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
    it("creates instance of AdyenPaymentIntentsApi", () => {
      const api = AdyenPaymentIntentsApi.createFromKey({ key: mockedAdyenRestrictedKey });

      expect(api).toBeInstanceOf(AdyenPaymentIntentsApi);
    });
  });
});
