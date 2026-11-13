import { describe, expect, it } from "vitest";

import { mockedAdyenPaymentIntentId } from "@/__tests__/mocks/mocked-adyen-payment-intent-id";
import { mockedAdyenRefundId } from "@/__tests__/mocks/mocked-adyen-refund-id";
import { AdyenAPIError } from "@/modules/adyen/adyen-api-error";
import { RefundFailureResult } from "@/modules/transaction-result/refund-result";

import { TransactionRefundRequestedUseCaseResponses } from "./use-case-response";

describe("TransactionRefundRequestedUseCaseResponses", () => {
  describe("Success", () => {
    it("getResponse() returns valid Response with status 200", async () => {
      const response = new TransactionRefundRequestedUseCaseResponses.Success({
        adyenRefundId: mockedAdyenRefundId,
        appContext: {
          adyenEnv: "LIVE",
        },
      });
      const fetchReponse = response.getResponse();

      expect(fetchReponse.status).toBe(200);
      expect(await fetchReponse.json()).toMatchInlineSnapshot(`
        {
          "pspReference": "re_TEST_TEST_TEST",
        }
      `);
    });
  });

  describe("Failure", () => {
    it("getResponse() returns valid Response with status 200", async () => {
      const response = new TransactionRefundRequestedUseCaseResponses.Failure({
        transactionResult: new RefundFailureResult(),
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        error: new AdyenAPIError("Error from adyen"),
        appContext: {
          adyenEnv: "LIVE",
        },
      });
      const fetchReponse = response.getResponse();

      expect(fetchReponse.status).toBe(200);
      expect(await fetchReponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [
            "REFUND",
          ],
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "There is a problem with the request to Adyen API",
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "REFUND_FAILURE",
        }
      `);
    });
  });
});
