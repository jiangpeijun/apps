import { assertUnreachable } from "@/lib/assert-unreachable";

import { type AdyenRefundStatus } from "../adyen/adyen-refund-status";
import { RefundFailureResult, RefundRequestResult, RefundSuccessResult } from "./refund-result";

export const mapRefundStatusToTransactionResult = (adyenRefundStatus: AdyenRefundStatus) => {
  switch (adyenRefundStatus) {
    case "succeeded":
      return new RefundSuccessResult();
    case "pending":
    case "requires_action":
      return new RefundRequestResult();
    case "failed":
    case "canceled":
      return new RefundFailureResult();
    default:
      assertUnreachable(adyenRefundStatus);
  }
};
