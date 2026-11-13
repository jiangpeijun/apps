import { generateRefundAdyenDashboardUrl } from "@/modules/adyen/generate-adyen-dashboard-urls";
import { type AdyenEnv } from "@/modules/adyen/adyen-env";
import { type AdyenRefundId } from "@/modules/adyen/adyen-refund-id";

import { mockedAdyenRefundId } from "./mocked-adyen-refund-id";

type Params = {
  refundId?: AdyenRefundId;
  adyenEnv?: AdyenEnv;
};

export const getMockedRefundDashboardUrl = (params?: Params) =>
  generateRefundAdyenDashboardUrl(
    params?.refundId ?? mockedAdyenRefundId,
    params?.adyenEnv ?? "LIVE",
  );
