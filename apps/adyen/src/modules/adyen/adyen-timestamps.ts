import type Adyen from "adyen";

import { createAdyenPaymentIntentStatus } from "./adyen-payment-intent-status";

const convertUnixTimestampToDate = (timestamp: number): Date => new Date(timestamp * 1000);

export const createTimestampFromAdyenEvent = (event: Adyen.Event): Date =>
  convertUnixTimestampToDate(event.created);

export const createTimestampFromPaymentIntent = (
  paymentIntent: Adyen.PaymentIntent,
): Date | null => {
  const status = createAdyenPaymentIntentStatus(paymentIntent.status);

  if (status === "canceled" && paymentIntent.canceled_at) {
    return convertUnixTimestampToDate(paymentIntent.canceled_at);
  }

  // For other statuses, Adyen sends us the PaymentIntent created date - which don't use to avoid raporting events from the past instead of the current date of the webhook event
  return null;
};
