import { type Result } from "neverthrow";

import { createAdyenPaymentIntentStatus } from "../adyen/adyen-payment-intent-status";
import { SaleorMoney } from "./saleor-money";

export const resolveSaleorMoneyFromAdyenPaymentIntent = (paymentIntent: {
  amount: number;
  amount_received: number;
  amount_capturable: number;
  currency: string;
  status: string;
}): Result<SaleorMoney, InstanceType<typeof SaleorMoney.ValidationError>> => {
  const adyenPaymentIntentStatus = createAdyenPaymentIntentStatus(paymentIntent.status);

  switch (adyenPaymentIntentStatus) {
    case "canceled":
    case "requires_payment_method":
    case "requires_action":
    case "processing":
      return SaleorMoney.createFromAdyen({
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      });
    case "requires_capture":
      return SaleorMoney.createFromAdyen({
        amount: paymentIntent.amount_capturable,
        currency: paymentIntent.currency,
      });
    default:
      return SaleorMoney.createFromAdyen({
        amount: paymentIntent.amount_received,
        currency: paymentIntent.currency,
      });
  }
};
