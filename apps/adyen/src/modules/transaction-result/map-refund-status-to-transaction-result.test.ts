import { describe, expect, it } from "vitest";

import { createAdyenRefundStatus } from "../adyen/adyen-refund-status";
import { mapRefundStatusToTransactionResult } from "./map-refund-status-to-transaction-result";
import { RefundFailureResult, RefundRequestResult, RefundSuccessResult } from "./refund-result";

describe("mapRefundStatusToTransactionResult", () => {
  it.each([
    { status: "succeeded", expectedResult: RefundSuccessResult },
    { status: "failed", expectedResult: RefundFailureResult },
    { status: "canceled", expectedResult: RefundFailureResult },
    { status: "pending", expectedResult: RefundRequestResult },
    { status: "requires_action", expectedResult: RefundRequestResult },
  ])(
    "maps Adyen Refund status: $status to transactionResult: $expectedResult.name",
    ({ status, expectedResult }) => {
      const adyenStatus = createAdyenRefundStatus(status);
      const result = mapRefundStatusToTransactionResult(adyenStatus);

      expect(result).toBeInstanceOf(expectedResult);
    },
  );
});
