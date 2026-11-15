// apps\adyen\src\app\api\webhooks\saleor\transaction-cancelation-requested\use-case-response.test.ts
import { describe, expect, it } from "vitest";

import { getMockedSaleorMoney } from "@/__tests__/mocks/constants";
import { mockedAdyenPaymentIntentId } from "@/__tests__/mocks/mocked-adyen-payment-intent-id";
import { AdyenAPIError } from "@/modules/adyen/adyen-api-error";
import {
  CancelFailureResult,
  CancelSuccessResult,
} from "@/modules/transaction-result/cancel-result";

import { TransactionCancelationRequestedUseCaseResponses } from "./use-case-response";

describe("TransactionCancellationRequestedUseCaseResponses", () => {
  describe("Success", () => {
    it("getResponse() returns valid Response with status 200", async () => {
      const response = new TransactionCancelationRequestedUseCaseResponses.Success({
        saleorMoney: getMockedSaleorMoney(),
        transactionResult: new CancelSuccessResult(),
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        timestamp: new Date(2023, 0, 1),
        appContext: {
          adyenEnv: "LIVE",
        },
      });
      const fetchReponse = response.getResponse();

      expect(fetchReponse.status).toBe(200);

      expect(await fetchReponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent was cancelled",
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "CANCEL_SUCCESS",
          "time": "2023-01-01T00:00:00.000Z",
        }
      `);
    });
  });

  describe("Failure", () => {
    it("getResponse() returns valid Response with status 200", async () => {
      const response = new TransactionCancelationRequestedUseCaseResponses.Failure({
        transactionResult: new CancelFailureResult(),
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
            "CANCEL",
          ],
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "There is a problem with the request to Adyen API",
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "CANCEL_FAILURE",
        }
      `);
    });
  });
});
