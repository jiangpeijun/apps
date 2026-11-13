import { describe, expect, it } from "vitest";

import {
  mockedAdyenCardPaymentMethod,
  mockedAdyenOtherPaymentMethod,
} from "@/__tests__/mocks/mocked-adyen-payment-method";

import { SaleorPaymentMethodDetails } from "./saleor-payment-method-details";

describe("SaleorPaymentMethodDetails", () => {
  describe("createFromAdyen", () => {
    it("creates a valid instance from Adyen PaymentMethod object", () => {
      const result = SaleorPaymentMethodDetails.createFromAdyen(mockedAdyenCardPaymentMethod);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeInstanceOf(SaleorPaymentMethodDetails);
    });

    it("returns error when payment method is null", () => {
      const result = SaleorPaymentMethodDetails.createFromAdyen(null);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(
        SaleorPaymentMethodDetails.SaleorPaymentMethodDetailsError,
      );
      expect(result._unsafeUnwrapErr().message).toBe("Payment method is null");
    });

    it("returns error when payment method is a string", () => {
      const result = SaleorPaymentMethodDetails.createFromAdyen("pm_123456789");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(
        SaleorPaymentMethodDetails.SaleorPaymentMethodDetailsError,
      );
      expect(result._unsafeUnwrapErr().message).toBe("Payment method is a string");
    });
  });

  describe("toSaleorWebhookResponse", () => {
    it("returns CARD type with all card details when payment method is a card", () => {
      const paymentMethodDetails = SaleorPaymentMethodDetails.createFromAdyen(
        mockedAdyenCardPaymentMethod,
      )._unsafeUnwrap();

      const result = paymentMethodDetails.toSaleorWebhookResponse();

      expect(result).toMatchInlineSnapshot(`
        {
          "brand": "visa",
          "expMonth": 12,
          "expYear": 2025,
          "lastDigits": "4242",
          "name": "Visa",
          "type": "CARD",
        }
      `);
    });

    it("returns CARD type with generic_card name when display_brand is missing", () => {
      const cardWithoutDisplayBrand = {
        ...mockedAdyenCardPaymentMethod,
        card: {
          ...mockedAdyenCardPaymentMethod.card!,
          display_brand: null,
        },
      };

      const paymentMethodDetails =
        SaleorPaymentMethodDetails.createFromAdyen(cardWithoutDisplayBrand)._unsafeUnwrap();

      const result = paymentMethodDetails.toSaleorWebhookResponse();

      expect(result).toMatchInlineSnapshot(`
        {
          "brand": "visa",
          "expMonth": 12,
          "expYear": 2025,
          "lastDigits": "4242",
          "name": "card",
          "type": "CARD",
        }
      `);
    });

    it("returns OTHER type with payment method type name for non-card payment methods", () => {
      const paymentMethodDetails = SaleorPaymentMethodDetails.createFromAdyen(
        mockedAdyenOtherPaymentMethod,
      )._unsafeUnwrap();

      const result = paymentMethodDetails.toSaleorWebhookResponse();

      expect(result).toMatchInlineSnapshot(`
        {
          "name": "sepa_debit",
          "type": "OTHER",
        }
      `);
    });
  });

  describe("toSaleorTransactionEventPayload", () => {
    it("returns card object with all card details when payment method is a card", () => {
      const paymentMethodDetails = SaleorPaymentMethodDetails.createFromAdyen(
        mockedAdyenCardPaymentMethod,
      )._unsafeUnwrap();

      const result = paymentMethodDetails.toSaleorTransactionEventPayload();

      expect(result).toMatchInlineSnapshot(`
        {
          "card": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
          },
        }
      `);
    });

    it("returns card object with generic_card name when display_brand is missing", () => {
      const cardWithoutDisplayBrand = {
        ...mockedAdyenCardPaymentMethod,
        card: {
          ...mockedAdyenCardPaymentMethod.card!,
          display_brand: null,
        },
      };

      const paymentMethodDetails =
        SaleorPaymentMethodDetails.createFromAdyen(cardWithoutDisplayBrand)._unsafeUnwrap();

      const result = paymentMethodDetails.toSaleorTransactionEventPayload();

      expect(result).toMatchInlineSnapshot(`
        {
          "card": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "card",
          },
        }
      `);
    });

    it("returns other object with payment method type name for non-card payment methods", () => {
      const paymentMethodDetails = SaleorPaymentMethodDetails.createFromAdyen(
        mockedAdyenOtherPaymentMethod,
      )._unsafeUnwrap();

      const result = paymentMethodDetails.toSaleorTransactionEventPayload();

      expect(result).toMatchInlineSnapshot(`
        {
          "other": {
            "name": "sepa_debit",
          },
        }
      `);
    });
  });
});
