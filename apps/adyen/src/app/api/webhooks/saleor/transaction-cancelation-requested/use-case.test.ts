import { err, ok } from "neverthrow";
import type Adyen from "adyen";
import { describe, expect, it, vi } from "vitest";

import { mockedAppConfigRepo } from "@/__tests__/mocks/app-config-repo";
import {
  mockedSaleorActionIdempotencyKey,
  mockedSaleorAppId,
  mockedSaleorTransactionId,
} from "@/__tests__/mocks/constants";
import { mockAdyenProblemReporter } from "@/__tests__/mocks/mock-adyen-problem-reporter";
import { mockedAdyenPaymentIntentId } from "@/__tests__/mocks/mocked-adyen-payment-intent-id";
import { mockedAdyenPaymentIntentsApi } from "@/__tests__/mocks/mocked-adyen-payment-intents-api";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { getMockedTransactionCancelationRequestedEvent } from "@/__tests__/mocks/saleor-events/transaction-cancelation-request-event";
import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { AdyenAPIError } from "@/modules/adyen/adyen-api-error";
import { type IAdyenPaymentIntentsApiFactory } from "@/modules/adyen/types";
import {
  CancelFailureResult,
  CancelSuccessResult,
} from "@/modules/transaction-result/cancel-result";

import { TransactionCancelationRequestedUseCase } from "./use-case";
import { TransactionCancelationRequestedUseCaseResponses } from "./use-case-response";

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

describe("TransactionCancelationRequestedUseCase", () => {
  const adyenPaymentIntentsApiFactory = {
    create: () => mockedAdyenPaymentIntentsApi,
  } satisfies IAdyenPaymentIntentsApiFactory;

  it("Calls Adyen PaymentIntent API to cancel payment intent and returns Success with CancelSuccessResult when payment intent is canceled successfully", async () => {
    const spy = vi
      .spyOn(mockedAdyenPaymentIntentsApi, "cancelPaymentIntent")
      .mockImplementationOnce(async () =>
        ok({
          amount: 100,
          currency: "usd",
          id: mockedAdyenPaymentIntentId.toString(), // adyen doesn't expect to get branded type here
          status: "canceled",
        } as Adyen.PaymentIntent),
      );

    const uc = new TransactionCancelationRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionCancelationRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrap()).toBeInstanceOf(
      TransactionCancelationRequestedUseCaseResponses.Success,
    );
    expect(result._unsafeUnwrap().transactionResult).toBeInstanceOf(CancelSuccessResult);

    expect(spy).toHaveBeenCalledWith({
      id: mockedAdyenPaymentIntentId,
      idempotencyKey: mockedSaleorActionIdempotencyKey,
    });
  });

  it("Calls Adyen PaymentIntent API to cancel payment intent and returns Failure with CancelFailureResult when payment intent cancel fails", async () => {
    const spy = vi
      .spyOn(mockedAdyenPaymentIntentsApi, "cancelPaymentIntent")
      .mockImplementationOnce(async () => err(new AdyenAPIError("Error from Adyen API")));

    const uc = new TransactionCancelationRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionCancelationRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrap()).toBeInstanceOf(
      TransactionCancelationRequestedUseCaseResponses.Failure,
    );
    expect(result._unsafeUnwrap().transactionResult).toBeInstanceOf(CancelFailureResult);

    expect(spy).toHaveBeenCalledWith({
      id: mockedAdyenPaymentIntentId,
      idempotencyKey: mockedSaleorActionIdempotencyKey,
    });
  });

  it("Returns 'MissingConfigErrorResponse' if config not found for specified channel", async () => {
    const spy = vi
      .spyOn(mockedAppConfigRepo, "getAdyenConfig")
      .mockImplementationOnce(async () => ok(null));

    const uc = new TransactionCancelationRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
    });

    const responsePayload = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionCancelationRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    const err = responsePayload._unsafeUnwrapErr();

    expect(spy).toHaveBeenCalledOnce();

    expect(err).toBeInstanceOf(AppIsNotConfiguredResponse);
  });

  it("Returns 'BrokenAppResponse' when currency coming from Adyen is not supported", async () => {
    vi.spyOn(mockedAdyenPaymentIntentsApi, "cancelPaymentIntent").mockImplementation(async () =>
      ok({
        amount: 100,
        currency: "abc",
        status: "canceled",
      } as Adyen.PaymentIntent),
    );
    const uc = new TransactionCancelationRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
    });

    const response = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionCancelationRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    expect(response._unsafeUnwrapErr()).toBeInstanceOf(BrokenAppResponse);
  });

  it("Throws error when Saleor event has no transaction", async () => {
    const saleorEvent = { ...getMockedTransactionCancelationRequestedEvent(), transaction: null };

    const uc = new TransactionCancelationRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
    });

    await expect(
      uc.execute({
        saleorApiUrl: mockedSaleorApiUrl,
        appId: mockedSaleorAppId,
        event: saleorEvent,
        problemReporter: mockAdyenProblemReporter,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[MissingTransactionError: Transaction not found in event]`,
    );
  });

  it("Throws error when Saleor event has no channel for Saleor Checkout or Order", async () => {
    const saleorEvent = {
      ...getMockedTransactionCancelationRequestedEvent(),
      transaction: {
        checkout: null,
        order: null,
        pspReference: mockedAdyenPaymentIntentId,
        id: mockedSaleorTransactionId,
      },
    };

    const uc = new TransactionCancelationRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
    });

    await expect(
      uc.execute({
        saleorApiUrl: mockedSaleorApiUrl,
        appId: mockedSaleorAppId,
        event: saleorEvent,
        problemReporter: mockAdyenProblemReporter,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[MissingChannelIdError: Channel ID not found in event Checkout or Order]`,
    );
  });
});
