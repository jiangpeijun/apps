import { describe, expect, it } from "vitest";

import { resolveSaleorMoneyFromAdyenPaymentIntent } from "./resolve-saleor-money-from-adyen-payment-intent";

describe("resolveSaleorMoneyFromAdyenPaymentIntent", () => {
  it("when AdyenPaymentIntent has status: 'canceled' should use the 'amount' field", () => {
    const result = resolveSaleorMoneyFromAdyenPaymentIntent({
      status: "canceled",
      amount: 45689,
      amount_capturable: 0,
      amount_received: 0,
      currency: "jpy",
    });

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      SaleorMoney {
        "amount": 45689,
        "currency": "JPY",
      }
    `);
  });

  it("when AdyenPaymentIntent has status: 'requires_payment_method' should use the 'amount' field", () => {
    const result = resolveSaleorMoneyFromAdyenPaymentIntent({
      status: "requires_payment_method",
      amount: 12356,
      amount_capturable: 0,
      amount_received: 0,
      currency: "pln",
    });

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      SaleorMoney {
        "amount": 123.56,
        "currency": "PLN",
      }
    `);
  });

  it("when AdyenPaymentIntent has status: 'requires_capture' should use the 'amount_capturable' field", () => {
    const result = resolveSaleorMoneyFromAdyenPaymentIntent({
      status: "requires_capture",
      amount: 0,
      amount_capturable: 99978,
      amount_received: 0,
      currency: "eur",
    });

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      SaleorMoney {
        "amount": 999.78,
        "currency": "EUR",
      }
    `);
  });

  it("when AdyenPaymentIntent has other status should use the 'amount_received' field", () => {
    const result = resolveSaleorMoneyFromAdyenPaymentIntent({
      status: "succeeded",
      amount: 0,
      amount_capturable: 0,
      amount_received: 123456,
      currency: "usd",
    });

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      SaleorMoney {
        "amount": 1234.56,
        "currency": "USD",
      }
    `);
  });
});
