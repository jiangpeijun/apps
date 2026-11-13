import { generatePaymentIntentAdyenDashboardUrl } from "@/modules/adyen/generate-adyen-dashboard-urls";
import { type AdyenEnv } from "@/modules/adyen/adyen-env";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";

import { mockedAdyenPaymentIntentId } from "./mocked-adyen-payment-intent-id";

type Params = {
  paymentIntentId?: AdyenPaymentIntentId;
  adyenEnv?: AdyenEnv;
};

export const getMockedPaymentIntentDashboardUrl = (params?: Params) =>
  generatePaymentIntentAdyenDashboardUrl(
    params?.paymentIntentId ?? mockedAdyenPaymentIntentId,
    params?.adyenEnv ?? "TEST",
  );
