import { describe, expect, it } from "vitest";

import { getMockedSaleorMoney } from "@/__tests__/mocks/constants";
import { mockedAdyenPaymentIntentId } from "@/__tests__/mocks/mocked-adyen-payment-intent-id";
import {
  mockedAdyenCardPaymentMethod,
  mockedAdyenOtherPaymentMethod,
} from "@/__tests__/mocks/mocked-adyen-payment-method";
import { SaleorPaymentMethodDetails } from "@/modules/saleor/saleor-payment-method-details";
import { AdyenInvalidRequestError } from "@/modules/adyen/adyen-api-error";
import { createAdyenPaymentIntentStatus } from "@/modules/adyen/adyen-payment-intent-status";
import {
  AuthorizationActionRequiredResult,
  ChargeActionRequiredResult,
} from "@/modules/transaction-result/action-required-result";
import {
  AuthorizationFailureResult,
  ChargeFailureResult,
} from "@/modules/transaction-result/failure-result";
import {
  AuthorizationRequestResult,
  ChargeRequestResult,
} from "@/modules/transaction-result/request-result";
import {
  AuthorizationSuccessResult,
  ChargeSuccessResult,
} from "@/modules/transaction-result/success-result";

import { TransactionProcessSessionUseCaseResponses } from "./use-case-response";

describe("TransactionProcessSessionUseCaseResponses", () => {
  describe("Success", () => {
    it("getResponse() returns valid Response with status 200 and message indicating that intent is succeeded if transactionResult is ChargeSuccess", async () => {
      const transactionResult = new ChargeSuccessResult();

      const response = new TransactionProcessSessionUseCaseResponses.Success({
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: null,
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails: null,
      });
      const fetchResponse = response.getResponse();

      expect(fetchResponse.status).toBe(200);
      expect(await fetchResponse.json()).toMatchInlineSnapshot(`
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

    it("getResponse() returns valid Response with status 200 and message indicating that intent is succeeded if transactionResult is AuthorizationSuccess", async () => {
      const transactionResult = new AuthorizationSuccessResult();

      const response = new TransactionProcessSessionUseCaseResponses.Success({
        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: null,
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails: null,
      });
      const fetchReponse = response.getResponse();

      expect(fetchReponse.status).toBe(200);
      expect(await fetchReponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [
            "CHARGE",
            "CANCEL",
          ],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent has been successful",
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "AUTHORIZATION_SUCCESS",
        }
      `);
    });

    it("getResponse() returns valid Response with status 200 and message indicating that intent requires action if transactionResult is ChargeActionRequired", async () => {
      const transactionResult = new ChargeActionRequiredResult(
        createAdyenPaymentIntentStatus("requires_action"),
      );
      const response = new TransactionProcessSessionUseCaseResponses.Success({
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,

        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: new Date(2025, 1, 1, 21, 37),
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails: null,
      });
      const fetchResponse = response.getResponse();

      expect(fetchResponse.status).toBe(200);
      expect(await fetchResponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [
            "CANCEL",
          ],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent requires action",
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "CHARGE_ACTION_REQUIRED",
          "time": "2025-02-01T21:37:00.000Z",
        }
      `);
    });

    it("getResponse() returns valid Response with status 200 and message indicating that intent requires action if transactionResult is AuthorizationActionRequired", async () => {
      const transactionResult = new AuthorizationActionRequiredResult(
        createAdyenPaymentIntentStatus("requires_action"),
      );
      const response = new TransactionProcessSessionUseCaseResponses.Success({
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: null,
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails: null,
      });
      const fetchReponse = response.getResponse();

      expect(fetchReponse.status).toBe(200);
      expect(await fetchReponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [
            "CANCEL",
          ],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent requires action",
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "AUTHORIZATION_ACTION_REQUIRED",
        }
      `);
    });

    it("getResponse() returns valid Response with status 200 and message indicating that intent is processing if transactionResult is ChargeRequest", async () => {
      const transactionResult = new ChargeRequestResult();
      const response = new TransactionProcessSessionUseCaseResponses.Success({
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: null,
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails: null,
      });
      const fetchReponse = response.getResponse();

      expect(fetchReponse.status).toBe(200);
      expect(await fetchReponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent is processing",
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "CHARGE_REQUEST",
        }
      `);
    });

    it("getResponse() returns valid Response with status 200 and message indicating that intent is processing if transactionResult is AuthorizationRequest", async () => {
      const transactionResult = new AuthorizationRequestResult();
      const response = new TransactionProcessSessionUseCaseResponses.Success({
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: null,
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails: null,
      });
      const fetchResponse = response.getResponse();

      expect(fetchResponse.status).toBe(200);
      expect(await fetchResponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent is processing",
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "AUTHORIZATION_REQUEST",
        }
      `);
    });

    it("getResponse() returns valid Response with card payment method details when saleorPaymentMethodDetails is provided", async () => {
      const saleorPaymentMethodDetails = SaleorPaymentMethodDetails.createFromAdyen(
        mockedAdyenCardPaymentMethod,
      )._unsafeUnwrap();

      const transactionResult = new ChargeSuccessResult();
      const response = new TransactionProcessSessionUseCaseResponses.Success({
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: null,
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails,
      });
      const fetchResponse = response.getResponse();

      expect(fetchResponse.status).toBe(200);
      expect(await fetchResponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [
            "REFUND",
          ],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent has been successful",
          "paymentMethodDetails": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
            "type": "CARD",
          },
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "CHARGE_SUCCESS",
        }
      `);
    });

    it("getResponse() returns valid Response with non-card payment method details when saleorPaymentMethodDetails is provided", async () => {
      const saleorPaymentMethodDetails = SaleorPaymentMethodDetails.createFromAdyen(
        mockedAdyenOtherPaymentMethod,
      )._unsafeUnwrap();

      const transactionResult = new AuthorizationSuccessResult();
      const response = new TransactionProcessSessionUseCaseResponses.Success({
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: null,
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails,
      });
      const fetchResponse = response.getResponse();

      expect(fetchResponse.status).toBe(200);
      expect(await fetchResponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [
            "CHARGE",
            "CANCEL",
          ],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent has been successful",
          "paymentMethodDetails": {
            "name": "sepa_debit",
            "type": "OTHER",
          },
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "AUTHORIZATION_SUCCESS",
        }
      `);
    });

    it("getResponse() returns valid Response with card payment method details when transactionResult is ChargeActionRequired", async () => {
      const saleorPaymentMethodDetails = SaleorPaymentMethodDetails.createFromAdyen(
        mockedAdyenCardPaymentMethod,
      )._unsafeUnwrap();

      const transactionResult = new ChargeActionRequiredResult(
        createAdyenPaymentIntentStatus("requires_action"),
      );
      const response = new TransactionProcessSessionUseCaseResponses.Success({
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: null,
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails,
      });
      const fetchResponse = response.getResponse();

      expect(fetchResponse.status).toBe(200);
      expect(await fetchResponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [
            "CANCEL",
          ],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent requires action",
          "paymentMethodDetails": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
            "type": "CARD",
          },
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "CHARGE_ACTION_REQUIRED",
        }
      `);
    });

    it("getResponse() returns valid Response with card payment method details when transactionResult is AuthorizationActionRequired", async () => {
      const saleorPaymentMethodDetails = SaleorPaymentMethodDetails.createFromAdyen(
        mockedAdyenCardPaymentMethod,
      )._unsafeUnwrap();

      const transactionResult = new AuthorizationActionRequiredResult(
        createAdyenPaymentIntentStatus("requires_action"),
      );
      const response = new TransactionProcessSessionUseCaseResponses.Success({
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: null,
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails,
      });
      const fetchResponse = response.getResponse();

      expect(fetchResponse.status).toBe(200);
      expect(await fetchResponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [
            "CANCEL",
          ],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent requires action",
          "paymentMethodDetails": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
            "type": "CARD",
          },
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "AUTHORIZATION_ACTION_REQUIRED",
        }
      `);
    });

    it("getResponse() returns valid Response with card payment method details when transactionResult is ChargeRequest", async () => {
      const saleorPaymentMethodDetails = SaleorPaymentMethodDetails.createFromAdyen(
        mockedAdyenCardPaymentMethod,
      )._unsafeUnwrap();

      const transactionResult = new ChargeRequestResult();
      const response = new TransactionProcessSessionUseCaseResponses.Success({
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: null,
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails,
      });
      const fetchResponse = response.getResponse();

      expect(fetchResponse.status).toBe(200);
      expect(await fetchResponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent is processing",
          "paymentMethodDetails": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
            "type": "CARD",
          },
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "CHARGE_REQUEST",
        }
      `);
    });

    it("getResponse() returns valid Response with card payment method details when transactionResult is AuthorizationRequest", async () => {
      const saleorPaymentMethodDetails = SaleorPaymentMethodDetails.createFromAdyen(
        mockedAdyenCardPaymentMethod,
      )._unsafeUnwrap();

      const transactionResult = new AuthorizationRequestResult();
      const response = new TransactionProcessSessionUseCaseResponses.Success({
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: null,
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails,
      });
      const fetchResponse = response.getResponse();

      expect(fetchResponse.status).toBe(200);
      expect(await fetchResponse.json()).toMatchInlineSnapshot(`
        {
          "actions": [],
          "amount": 10,
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent is processing",
          "paymentMethodDetails": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
            "type": "CARD",
          },
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "AUTHORIZATION_REQUEST",
        }
      `);
    });

    it("getResponse() returns valid Response without paymentMethodDetails field when saleorPaymentMethodDetails is null", async () => {
      const transactionResult = new ChargeSuccessResult();
      const response = new TransactionProcessSessionUseCaseResponses.Success({
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(),
        transactionResult,
        timestamp: null,
        appContext: {
          adyenEnv: "LIVE",
        },
        saleorPaymentMethodDetails: null,
      });
      const fetchResponse = response.getResponse();
      const jsonResponse = await fetchResponse.json();

      expect(fetchResponse.status).toBe(200);
      expect(jsonResponse).not.toHaveProperty("paymentMethodDetails");
      expect(jsonResponse).toMatchInlineSnapshot(`
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

    describe("Failure", () => {
      it("getResponse() returns valid Response with status 200 and message with error reason and additional information inside data object if transactionResult is ChargeFailure", async () => {
        const transactionResult = new ChargeFailureResult();

        const successResponse = new TransactionProcessSessionUseCaseResponses.Failure({
          adyenPaymentIntentId: mockedAdyenPaymentIntentId,
          error: new AdyenInvalidRequestError("Invalid request"),
          transactionResult,
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
            "data": {
              "paymentIntent": {
                "errors": [
                  {
                    "code": "AdyenApiError",
                    "message": "There is a problem with the request to Adyen API",
                  },
                ],
              },
            },
            "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
            "message": "There is a problem with the request to Adyen API",
            "pspReference": "pi_TEST_TEST_TEST",
            "result": "CHARGE_FAILURE",
          }
        `);
      });

      it("getResponse() returns valid Response with status 200 and message with error reason and additional information inside data object if transactionResult is AuthorizationFailure", async () => {
        const transactionResult = new AuthorizationFailureResult();

        const successResponse = new TransactionProcessSessionUseCaseResponses.Failure({
          appContext: {
            adyenEnv: "LIVE",
          },
          adyenPaymentIntentId: mockedAdyenPaymentIntentId,
          error: new AdyenInvalidRequestError("Invalid request"),
          transactionResult,
        });
        const fetchReponse = successResponse.getResponse();

        expect(fetchReponse.status).toBe(200);
        expect(await fetchReponse.json()).toMatchInlineSnapshot(`
          {
            "actions": [
              "CANCEL",
            ],
            "data": {
              "paymentIntent": {
                "errors": [
                  {
                    "code": "AdyenApiError",
                    "message": "There is a problem with the request to Adyen API",
                  },
                ],
              },
            },
            "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
            "message": "There is a problem with the request to Adyen API",
            "pspReference": "pi_TEST_TEST_TEST",
            "result": "AUTHORIZATION_FAILURE",
          }
        `);
      });
    });
  });
});
