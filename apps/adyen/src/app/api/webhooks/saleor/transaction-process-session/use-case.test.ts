import { err, ok } from "neverthrow";
import type Adyen from "adyen";
import { describe, expect, it, vi } from "vitest";

import { mockedAppConfigRepo } from "@/__tests__/mocks/app-config-repo";
import { mockedSaleorAppId } from "@/__tests__/mocks/constants";
import { mockAuthData } from "@/__tests__/mocks/mock-auth-data";
import { mockAdyenProblemReporter } from "@/__tests__/mocks/mock-adyen-problem-reporter";
import { getMockedRecordedTransaction } from "@/__tests__/mocks/mocked-recorded-transaction";
import { mockedAdyenPaymentIntentId } from "@/__tests__/mocks/mocked-adyen-payment-intent-id";
import { mockedAdyenPaymentIntentsApi } from "@/__tests__/mocks/mocked-adyen-payment-intents-api";
import { MockedTransactionRecorder } from "@/__tests__/mocks/mocked-transaction-recorder";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { getMockedTransactionProcessSessionEvent } from "@/__tests__/mocks/saleor-events/transaction-process-session-event";
import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
  MalformedRequestResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { BaseError } from "@/lib/errors";
import { AdyenAPIError } from "@/modules/adyen/adyen-api-error";
import { type IAdyenPaymentIntentsApiFactory } from "@/modules/adyen/types";

import { TransactionProcessSessionUseCase } from "./use-case";
import { TransactionProcessSessionUseCaseResponses } from "./use-case-response";

vi.mock("@saleor/app-problems", () => ({
  AppProblemsReporter: class {
    reportProblem() {
      return Promise.resolve({ isErr: () => false });
    }
    clearProblems() {
      return Promise.resolve({ isErr: () => false });
    }
  },
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("TransactionProcessSessionUseCase", () => {
  const adyenPaymentIntentsApiFactory = {
    create: () => mockedAdyenPaymentIntentsApi,
  } satisfies IAdyenPaymentIntentsApiFactory;

  it.each([
    {
      actionType: "CHARGE" as const,
      paymentIntentStatus: "succeeded",
    },
    {
      actionType: "AUTHORIZATION" as const,
      paymentIntentStatus: "succeeded",
    },
    {
      actionType: "CHARGE" as const,
      paymentIntentStatus: "requires_payment_method",
    },
    {
      actionType: "AUTHORIZATION" as const,
      paymentIntentStatus: "requires_payment_method",
    },
    {
      actionType: "AUTHORIZATION" as const,
      paymentIntentStatus: "requires_confirmation",
    },
    {
      actionType: "CHARGE" as const,
      paymentIntentStatus: "requires_confirmation",
    },
    {
      actionType: "AUTHORIZATION" as const,
      paymentIntentStatus: "requires_action",
    },
    {
      actionType: "CHARGE" as const,
      paymentIntentStatus: "requires_action",
    },
    {
      actionType: "AUTHORIZATION" as const,
      paymentIntentStatus: "processing",
    },
    {
      actionType: "CHARGE" as const,
      paymentIntentStatus: "processing",
    },
    {
      actionType: "AUTHORIZATION" as const,
      paymentIntentStatus: "canceled",
    },
    {
      actionType: "CHARGE" as const,
      paymentIntentStatus: "canceled",
    },
    {
      actionType: "AUTHORIZATION" as const,
      paymentIntentStatus: "requires_capture",
    },
  ])(
    "Calls Adyen PaymentIntentsAPI to get payment intent and returns 'OK' response for actionType: $actionType and Adyen Payment Intent with status: $paymentIntentStatus",
    async ({ actionType, paymentIntentStatus }) => {
      const saleorEvent = getMockedTransactionProcessSessionEvent({ actionType });
      const mockedTransationRecorder = new MockedTransactionRecorder();

      mockedTransationRecorder.recordTransaction(mockAuthData, getMockedRecordedTransaction());

      vi.spyOn(mockedTransationRecorder, "getTransactionByAdyenPaymentIntentId");

      const spy = vi
        .spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent")
        .mockImplementationOnce(async () =>
          ok({
            amount: 100,
            currency: "usd",
            client_secret: "secret-value",
            id: mockedAdyenPaymentIntentId.toString(), // adyen doesn't expect to get branded type here
            status: paymentIntentStatus,
          } as Adyen.PaymentIntent),
        );
      const uc = new TransactionProcessSessionUseCase({
        appConfigRepo: mockedAppConfigRepo,
        adyenPaymentIntentsApiFactory,
        transactionRecorder: mockedTransationRecorder,
      });

      const result = await uc.execute({
        saleorApiUrl: mockedSaleorApiUrl,
        appId: mockedSaleorAppId,
        event: saleorEvent,
        problemReporter: mockAdyenProblemReporter,
      });

      expect(result._unsafeUnwrap()).toBeInstanceOf(
        TransactionProcessSessionUseCaseResponses.Success,
      );

      expect(spy).toHaveBeenCalledWith({
        id: mockedAdyenPaymentIntentId,
      });

      expect(mockedTransationRecorder.getTransactionByAdyenPaymentIntentId).toHaveBeenCalledWith(
        { saleorApiUrl: mockedSaleorApiUrl, appId: mockedSaleorAppId },
        mockedAdyenPaymentIntentId,
      );
    },
  );

  it("Returns 'MissingConfigErrorResponse' if config not found for specified channel", async () => {
    const spy = vi
      .spyOn(mockedAppConfigRepo, "getAdyenConfig")
      .mockImplementationOnce(async () => ok(null));

    const uc = new TransactionProcessSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    const responsePayload = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionProcessSessionEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    const err = responsePayload._unsafeUnwrapErr();

    expect(spy).toHaveBeenCalledOnce();

    expect(err).toBeInstanceOf(AppIsNotConfiguredResponse);
  });

  it.each([
    {
      actionType: "CHARGE" as const,
    },
    {
      actionType: "AUTHORIZATION" as const,
    },
  ])(
    "Returns 'Error' response if AdyenPaymentIntentsAPI throws error and actionType is $actionType",
    async ({ actionType }) => {
      const mockedTransationRecorder = new MockedTransactionRecorder();

      mockedTransationRecorder.recordTransaction(mockAuthData, getMockedRecordedTransaction());

      vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(async () =>
        err(new AdyenAPIError("Error from Adyen API")),
      );

      const uc = new TransactionProcessSessionUseCase({
        appConfigRepo: mockedAppConfigRepo,
        adyenPaymentIntentsApiFactory,
        transactionRecorder: mockedTransationRecorder,
      });

      const saleorEvent = getMockedTransactionProcessSessionEvent({ actionType });

      const responsePayload = await uc.execute({
        saleorApiUrl: mockedSaleorApiUrl,
        appId: mockedSaleorAppId,
        event: saleorEvent,
        problemReporter: mockAdyenProblemReporter,
      });

      expect(responsePayload._unsafeUnwrap()).toBeInstanceOf(
        TransactionProcessSessionUseCaseResponses.Failure,
      );
    },
  );

  it("Returns 'BrokenAppResponse' when currency coming from Adyen is not supported", async () => {
    const saleorEvent = getMockedTransactionProcessSessionEvent();
    const mockedTransationRecorder = new MockedTransactionRecorder();

    mockedTransationRecorder.recordTransaction(mockAuthData, getMockedRecordedTransaction());

    vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(async () =>
      ok({
        amount: 100,
        currency: "abc",
        status: "succeeded",
      } as Adyen.PaymentIntent),
    );

    const uc = new TransactionProcessSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: mockedTransationRecorder,
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: saleorEvent,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(BrokenAppResponse);
  });

  it("Throws error when Adyen Payment Intent status is not supported", async () => {
    const saleorEvent = getMockedTransactionProcessSessionEvent();
    const mockedTransationRecorder = new MockedTransactionRecorder();

    mockedTransationRecorder.recordTransaction(mockAuthData, getMockedRecordedTransaction());

    vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(async () =>
      ok({
        amount: 100,
        currency: "usd",
        client_secret: "secret-value",
        id: mockedAdyenPaymentIntentId.toString(), // adyen doesn't expect to get branded type here
        status: "broken_status",
      } as unknown as Adyen.PaymentIntent),
    );

    const uc = new TransactionProcessSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: mockedTransationRecorder,
    });

    await expect(
      uc.execute({
        saleorApiUrl: mockedSaleorApiUrl,
        appId: mockedSaleorAppId,
        event: saleorEvent,
        problemReporter: mockAdyenProblemReporter,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "received": "broken_status",
          "code": "invalid_enum_value",
          "options": [
            "requires_action",
            "requires_confirmation",
            "requires_payment_method",
            "canceled",
            "processing",
            "requires_capture",
            "succeeded"
          ],
          "path": [],
          "message": "Invalid enum value. Expected 'requires_action' | 'requires_confirmation' | 'requires_payment_method' | 'canceled' | 'processing' | 'requires_capture' | 'succeeded', received 'broken_status'"
        }
      ]]
    `);
  });

  it("Returns 'MalformedRequestResponse' when there is an error with getting transactionRecord", async () => {
    const saleorEvent = getMockedTransactionProcessSessionEvent();
    const mockedTransationRecorder = new MockedTransactionRecorder();

    vi.spyOn(mockedTransationRecorder, "getTransactionByAdyenPaymentIntentId").mockImplementation(
      async () => err(new BaseError("Error while getting transaction record")),
    );

    const uc = new TransactionProcessSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: mockedTransationRecorder,
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: saleorEvent,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(MalformedRequestResponse);
  });
});
