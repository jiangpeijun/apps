import { type AdyenEnv } from "@/modules/adyen/adyen-env";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";

import { type AdyenRefundId } from "./adyen-refund-id";

export const generatePaymentIntentAdyenDashboardUrl = (
  paymentIntentId: AdyenPaymentIntentId,
  adyenEnv: AdyenEnv,
) => {
  switch (adyenEnv) {
    case "LIVE":
      return `https://dashboard.adyen.com/payments/${encodeURIComponent(paymentIntentId)}`;
    case "TEST":
      return `https://dashboard.adyen.com/test/payments/${encodeURIComponent(paymentIntentId)}`;
  }
};

export const generateRefundAdyenDashboardUrl = (
  refundId: AdyenRefundId,
  adyenEnv: AdyenEnv,
) => {
  switch (adyenEnv) {
    case "LIVE":
      return `https://dashboard.adyen.com/refunds/${encodeURIComponent(refundId)}`;
    case "TEST":
      return `https://dashboard.adyen.com/test/refunds/${encodeURIComponent(refundId)}`;
  }
};
