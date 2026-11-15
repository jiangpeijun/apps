// apps\adyen\src\app\api\webhooks\saleor\transaction-initialize-session\use-case-response.test.ts
import { describe, expect, it } from "vitest";

import { getMockedSaleorMoney } from "@/__tests__/mocks/constants";
import { mockedAdyenPaymentIntentId } from "@/__tests__/mocks/mocked-adyen-payment-intent-id";
import { AdyenAPIError } from "@/modules/adyen/adyen-api-error";
import { createAdyenClientSecret } from "@/modules/adyen/adyen-client-secret";
import { createAdyenPaymentIntentStatus } from "@/modules/adyen/adyen-payment-intent-status";
import {
  AuthorizationActionRequiredResult,
  ChargeActionRequiredResult,
} from "@/modules/transaction-result/action-required-result";
import {
  AuthorizationFailureResult,
  ChargeFailureResult,
} from "@/modules/transaction-result/failure-result";

import { ParseError, UnsupportedPaymentMethodError } from "./event-data-parser";
import { TransactionInitializeSessionUseCaseResponses } from "./use-case-response";

describe("TransactionInitializeSessionUseCaseResponses", () => {
  describe("Success with ChargeActionRequired as result", () => {
    it("getResponse() returns valid Response with status 200 and formatted 'data' object containing Adyen client secret", async () => {
      const response = new TransactionInitializeSessionUseCaseResponses.Success({
        transactionResult: new ChargeActionRequiredResult(
          createAdyenPaymentIntentStatus("requires_payment_method"),
        ),
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(10000),
        adyenClientSecret: createAdyenClientSecret("adyen-client-secret")._unsafeUnwrap(),
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
          "amount": 100,
          "data": {
            "paymentIntent": {
              "adyenClientSecret": "adyen-client-secret",
            },
          },
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent requires payment method",
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "CHARGE_ACTION_REQUIRED",
        }
      `);
    });
  });

  describe("Success with AuthorizationActionRequired as result", () => {
    it("getResponse() returns valid Response with status 200 and formatted 'data' object containing Adyen client secret", async () => {
      const response = new TransactionInitializeSessionUseCaseResponses.Success({
        transactionResult: new AuthorizationActionRequiredResult(
          createAdyenPaymentIntentStatus("requires_payment_method"),
        ),

        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
        saleorMoney: getMockedSaleorMoney(10000),
        adyenClientSecret: createAdyenClientSecret("adyen-client-secret")._unsafeUnwrap(),
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
          "amount": 100,
          "data": {
            "paymentIntent": {
              "adyenClientSecret": "adyen-client-secret",
            },
          },
          "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
          "message": "Payment intent requires payment method",
          "pspReference": "pi_TEST_TEST_TEST",
          "result": "AUTHORIZATION_ACTION_REQUIRED",
        }
      `);
    });
  });

  describe("Failure with TransactionInitializeChargeErrorResult as a result", () => {
    it("getResponse() returns valid Response with status 200 and message with failure reason and additional information inside data object", async () => {
      const response = new TransactionInitializeSessionUseCaseResponses.Failure({
        transactionResult: new ChargeFailureResult(),
        error: new UnsupportedPaymentMethodError("UnsupportedPaymentMethodError"),
        appContext: {
          adyenEnv: "LIVE",
        },
      });
      const fetchReponse = response.getResponse();

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
                  "code": "UnsupportedPaymentMethodError",
                  "message": "Provided payment method is not supported",
                },
              ],
            },
          },
          "message": "Provided payment method is not supported",
          "result": "CHARGE_FAILURE",
        }
      `);
    });

    it("getResponse() returns valid Response with status 200 and message with failure reason and BadRequest error inside data object", async () => {
      const successResponse = new TransactionInitializeSessionUseCaseResponses.Failure({
        transactionResult: new ChargeFailureResult(),
        error: new ParseError("Invalid data"),
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
                  "code": "ParseError",
                  "message": "Provided data is invalid. Check your data argument to transactionInitializeSession mutation and try again.",
                },
              ],
            },
          },
          "message": "Provided data is invalid. Check your data argument to transactionInitializeSession mutation and try again.",
          "result": "CHARGE_FAILURE",
        }
      `);
    });

    it("getResponse() returns valid Response with status 200 and message with failure reason and AdyenCreatePaymentIntentError error inside data object", async () => {
      const successResponse = new TransactionInitializeSessionUseCaseResponses.Failure({
        transactionResult: new ChargeFailureResult(),
        error: new AdyenAPIError("Error from Adyen API", {
          cause: new Error("Inner error"),
        }),
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
          "message": "There is a problem with the request to Adyen API",
          "result": "CHARGE_FAILURE",
        }
      `);
    });

    it("getResponse() returns valid Response with status 200 and message with failure reason and AdyenCreatePaymentIntentError error inside data object - TEST env passes Adyen error details", async () => {
      const successResponse = new TransactionInitializeSessionUseCaseResponses.Failure({
        transactionResult: new ChargeFailureResult(),
        error: new AdyenAPIError("Error from Adyen API", {
          cause: new Error("Inner error"),
        }),
        appContext: {
          adyenEnv: "TEST",
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
                  "message": "There is a problem with the request to Adyen API: Inner error
        Error from Adyen API",
                },
              ],
            },
          },
          "message": "There is a problem with the request to Adyen API: Inner error
        Error from Adyen API",
          "result": "CHARGE_FAILURE",
        }
      `);
    });
  });

  describe("Error with TransactionInitializeAuthorizationErrorResult as a result", () => {
    it("getResponse() returns valid Response with status 200 and message with failure reason and additional information inside data object", async () => {
      const successResponse = new TransactionInitializeSessionUseCaseResponses.Failure({
        transactionResult: new AuthorizationFailureResult(),
        error: new UnsupportedPaymentMethodError("UnsupportedPaymentMethodError"),
        appContext: {
          adyenEnv: "LIVE",
        },
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
                  "code": "UnsupportedPaymentMethodError",
                  "message": "Provided payment method is not supported",
                },
              ],
            },
          },
          "message": "Provided payment method is not supported",
          "result": "AUTHORIZATION_FAILURE",
        }
      `);
    });

    it("getResponse() returns valid Response with status 200 and message with failure reason and BadRequest error inside data object", async () => {
      const successResponse = new TransactionInitializeSessionUseCaseResponses.Failure({
        transactionResult: new AuthorizationFailureResult(),
        error: new ParseError("Invalid data"),
        appContext: {
          adyenEnv: "LIVE",
        },
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
                  "code": "ParseError",
                  "message": "Provided data is invalid. Check your data argument to transactionInitializeSession mutation and try again.",
                },
              ],
            },
          },
          "message": "Provided data is invalid. Check your data argument to transactionInitializeSession mutation and try again.",
          "result": "AUTHORIZATION_FAILURE",
        }
      `);
    });

    it("getResponse() returns valid Response with status 200 and message with failure reason and AdyenCreatePaymentIntentError error inside data object", async () => {
      const successResponse = new TransactionInitializeSessionUseCaseResponses.Failure({
        transactionResult: new AuthorizationFailureResult(),
        error: new AdyenAPIError("Error from Adyen API"),
        appContext: {
          adyenEnv: "LIVE",
        },
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
          "message": "There is a problem with the request to Adyen API",
          "result": "AUTHORIZATION_FAILURE",
        }
      `);
    });
  });
});
