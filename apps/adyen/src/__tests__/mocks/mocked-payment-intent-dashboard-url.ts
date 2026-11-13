import { generatePaymentIntentStripeDashboardUrl } from "@/modules/adyen/generate-adyen-dashboard-urls";
import { type StripeEnv } from "@/modules/adyen/adyen-env";
import { type StripePaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";

import { mockedStripePaymentIntentId } from "./mocked-adyen-payment-intent-id";

type Params = {
  paymentIntentId?: StripePaymentIntentId;
  stripeEnv?: StripeEnv;
};

export const getMockedPaymentIntentDashboardUrl = (params?: Params) =>
  generatePaymentIntentStripeDashboardUrl(
    params?.paymentIntentId ?? mockedStripePaymentIntentId,
    params?.stripeEnv ?? "TEST",
  );
