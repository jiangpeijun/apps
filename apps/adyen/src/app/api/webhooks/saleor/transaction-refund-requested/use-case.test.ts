// apps\adyen\src\app\api\webhooks\saleor\transaction-refund-requested\use-case.test.ts
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
import { mockedAdyenRefundId } from "@/__tests__/mocks/mocked-adyen-refund-id";
import { mockedAdyenRefundsApi } from "@/__tests__/mocks/mocked-adyen-refunds-api";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { getMockedTransactionRefundRequestedEvent } from "@/__tests__/mocks/saleor-events/transaction-refund-request-event";
import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
  MalformedRequestResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { AdyenAPIError } from "@/modules/adyen/adyen-api-error";
import { AdyenMoney } from "@/modules/adyen/adyen-money";
import { type IAdyenRefundsApiFactory } from "@/modules/adyen/types";

import { TransactionRefundRequestedUseCase } from "./use-case";
import { TransactionRefundRequestedUseCaseResponses } from "./use-case-response";

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

describe("TransactionRefundRequestedUseCase", () => {
  const adyenRefundsApiFactory = {
    create: () => mockedAdyenRefundsApi,
  } satisfies IAdyenRefundsApiFactory;

  it("Calls Adyen Refunds API to create refund and returns Success when refund is created successfully", async () => {
    const spy = vi.spyOn(mockedAdyenRefundsApi, "createRefund").mockImplementationOnce(async () =>
      ok({
        status: "succeeded",
        amount: 100,
        currency: "usd",
        id: mockedAdyenRefundId.toString(),
      } as Adyen.Refund),
    );

    const uc = new TransactionRefundRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenRefundsApiFactory,
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionRefundRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrap()).toBeInstanceOf(
      TransactionRefundRequestedUseCaseResponses.Success,
    );

    expect(spy).toHaveBeenCalledWith({
      paymentIntentId: mockedAdyenPaymentIntentId,
      adyenMoney: expect.any(AdyenMoney),
      idempotencyKey: mockedSaleorActionIdempotencyKey,
      metadata: {
        saleor_source_id: "mock-channel-1",
        saleor_source_type: "Checkout",
        saleor_transaction_id: "mocked-transaction-id",
        saleor_api_url: mockedSaleorApiUrl,
        saleor_app_id: mockedSaleorAppId,
        saleor_checkout_id: "mock-channel-1",
      },
    });
  });

  it("Calls Adyen Refunds API to create refund and returns Failure with RefundFailureResult when refund creation fails", async () => {
    const spy = vi
      .spyOn(mockedAdyenRefundsApi, "createRefund")
      .mockImplementationOnce(async () => err(new AdyenAPIError("Error from adyen")));

    const uc = new TransactionRefundRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenRefundsApiFactory,
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionRefundRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrap()).toBeInstanceOf(
      TransactionRefundRequestedUseCaseResponses.Failure,
    );

    expect(spy).toHaveBeenCalledWith({
      paymentIntentId: mockedAdyenPaymentIntentId,
      adyenMoney: expect.any(AdyenMoney),
      idempotencyKey: mockedSaleorActionIdempotencyKey,
      metadata: {
        saleor_source_id: "mock-channel-1",
        saleor_source_type: "Checkout",
        saleor_transaction_id: "mocked-transaction-id",
        saleor_api_url: mockedSaleorApiUrl,
        saleor_app_id: mockedSaleorAppId,
        saleor_checkout_id: "mock-channel-1",
      },
    });
  });

  it("Returns 'MissingConfigErrorResponse' if config not found for specified channel", async () => {
    const spy = vi
      .spyOn(mockedAppConfigRepo, "getAdyenConfig")
      .mockImplementationOnce(async () => ok(null));

    const uc = new TransactionRefundRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenRefundsApiFactory,
    });

    const responsePayload = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionRefundRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    const err = responsePayload._unsafeUnwrapErr();

    expect(spy).toHaveBeenCalledOnce();

    expect(err).toBeInstanceOf(AppIsNotConfiguredResponse);
  });

  it("Returns 'MalformedRequestResponse' when currency coming from Saleor is not supported", async () => {
    const saleorEvent = {
      ...getMockedTransactionRefundRequestedEvent(),
      action: {
        amount: 100,
        currency: "abc",
      },
    };
    const uc = new TransactionRefundRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenRefundsApiFactory,
    });

    const response = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: saleorEvent,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(response._unsafeUnwrapErr()).toBeInstanceOf(MalformedRequestResponse);
  });

  it("Returns 'BrokenAppResponse' when currency coming from Adyen is not supported", async () => {
    vi.spyOn(mockedAdyenRefundsApi, "createRefund").mockImplementation(async () =>
      ok({
        amount: 100,
        currency: "abc",
      } as Adyen.Refund),
    );
    const uc = new TransactionRefundRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenRefundsApiFactory,
    });

    const response = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionRefundRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    expect(response._unsafeUnwrapErr()).toBeInstanceOf(BrokenAppResponse);
  });

  it("Throws error when Saleor event has no transaction", async () => {
    const saleorEvent = { ...getMockedTransactionRefundRequestedEvent(), transaction: null };

    const uc = new TransactionRefundRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenRefundsApiFactory,
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
      ...getMockedTransactionRefundRequestedEvent(),
      transaction: {
        checkout: null,
        order: null,
        pspReference: mockedAdyenPaymentIntentId,
        id: mockedSaleorTransactionId,
      },
    };

    const uc = new TransactionRefundRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenRefundsApiFactory,
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
