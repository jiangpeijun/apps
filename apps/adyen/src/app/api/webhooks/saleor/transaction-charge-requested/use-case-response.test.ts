import { describe, expect, it } from "vitest";

import { getMockedSaleorMoney } from "@/__tests__/mocks/constants";
import { mockedAdyenPaymentIntentId } from "@/__tests__/mocks/mocked-adyen-payment-intent-id";
import { AdyenAPIError } from "@/modules/adyen/adyen-api-error";
import { ChargeFailureResult } from "@/modules/transaction-result/failure-result";
import { ChargeSuccessResult } from "@/modules/transaction-result/success-result";

import { TransactionChargeRequestedUseCaseResponses } from "./use-case-response";

describe("TransactionChargeRequestedUseCaseResponses", () => {
  describe("Success with ChargeSuccessResult", () => {
    it("getResponse() returns valid Response with status 200", async () => {
      const successResponse = new TransactionChargeRequestedUseCaseResponses.Success({
        transactionResult: new ChargeSuccessResult(),
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(),
        appContext: {
          adyenEnv: "LIVE",
        },
      });
      const fetchReponse = successResponse.getResponse();

      expect(fetchReponse.status).toBe(200);
      expect(await fetchReponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [
            "REFUND",
          ],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent has been successful",
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "CHARGE_SUCCESS",
        }
      `);
    });
  });

  describe("Failure with ChargeFailureResult", () => {
    it("getResponse() returns valid Response with status 200", async () => {
      const successResponse = new TransactionChargeRequestedUseCaseResponses.Failure({
        transactionResult: new ChargeFailureResult(),
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        error: new AdyenAPIError("Error from adyen"),
        appContext: {
          adyenEnv: "LIVE",
        },
      });
      const fetchReponse = successResponse.getResponse();

      expect(fetchReponse.status).toBe(200);
      expect(await fetchReponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [
            "CHARGE",
          ],
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent failed",
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "CHARGE_FAILURE",
        }
      `);
    });
  });
});
