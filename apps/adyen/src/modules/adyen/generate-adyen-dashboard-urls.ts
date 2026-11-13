import { type StripeEnv } from "@/modules/adyen/adyen-env";
import { type StripePaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";

import { type StripeRefundId } from "./adyen-refund-id";

export const generatePaymentIntentStripeDashboardUrl = (
  paymentIntentId: StripePaymentIntentId,
  stripeEnv: StripeEnv,
) => {
  switch (stripeEnv) {
    case "LIVE":
      return `https://dashboard.stripe.com/payments/${encodeURIComponent(paymentIntentId)}`;
    case "TEST":
      return `https://dashboard.stripe.com/test/payments/${encodeURIComponent(paymentIntentId)}`;
  }
};

export const generateRefundStripeDashboardUrl = (
  refundId: StripeRefundId,
  stripeEnv: StripeEnv,
) => {
  switch (stripeEnv) {
    case "LIVE":
      return `https://dashboard.stripe.com/refunds/${encodeURIComponent(refundId)}`;
    case "TEST":
      return `https://dashboard.stripe.com/test/refunds/${encodeURIComponent(refundId)}`;
  }
};
