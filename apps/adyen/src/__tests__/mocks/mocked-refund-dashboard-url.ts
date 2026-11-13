import { generateRefundStripeDashboardUrl } from "@/modules/adyen/generate-adyen-dashboard-urls";
import { type StripeEnv } from "@/modules/adyen/adyen-env";
import { type StripeRefundId } from "@/modules/adyen/adyen-refund-id";

import { mockedStripeRefundId } from "./mocked-adyen-refund-id";

type Params = {
  refundId?: StripeRefundId;
  stripeEnv?: StripeEnv;
};

export const getMockedRefundDashboardUrl = (params?: Params) =>
  generateRefundStripeDashboardUrl(
    params?.refundId ?? mockedStripeRefundId,
    params?.stripeEnv ?? "LIVE",
  );
