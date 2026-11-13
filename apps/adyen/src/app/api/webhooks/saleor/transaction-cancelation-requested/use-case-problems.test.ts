import { err } from "neverthrow";
import Adyen from "adyen";
import { describe, expect, it, vi } from "vitest";

import { mockedAppConfigRepo } from "@/__tests__/mocks/app-config-repo";
import { mockedConfigurationId, mockedSaleorAppId } from "@/__tests__/mocks/constants";
import { mockAdyenProblemReporter } from "@/__tests__/mocks/mock-adyen-problem-reporter";
import { mockedAdyenPaymentIntentsApi } from "@/__tests__/mocks/mocked-adyen-payment-intents-api";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { getMockedTransactionCancelationRequestedEvent } from "@/__tests__/mocks/saleor-events/transaction-cancelation-request-event";
import {
  AdyenAPIError,
  AdyenAuthenticationError,
  AdyenPermissionError,
} from "@/modules/adyen/adyen-api-error";
import { type IAdyenPaymentIntentsApiFactory } from "@/modules/adyen/types";

import { TransactionCancelationRequestedUseCase } from "./use-case";

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

describe("TransactionCancelationRequestedUseCase - problem reporting", () => {
  const adyenPaymentIntentsApiFactory = {
    create: () => mockedAdyenPaymentIntentsApi,
  } satisfies IAdyenPaymentIntentsApiFactory;

  it("Reports authentication problem when Adyen returns AdyenAuthenticationError", async () => {
    vi.spyOn(mockedAdyenPaymentIntentsApi, "cancelPaymentIntent").mockImplementationOnce(
      async () =>
        err(
          new Adyen.errors.AdyenAuthenticationError({
            type: "authentication_error",
            message: "Invalid API key",
          }),
        ),
    );

    const reportSpy = vi.spyOn(mockAdyenProblemReporter, "reportApiProblem");

    const uc = new TransactionCancelationRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
    });

    await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionCancelationRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    expect(reportSpy).toHaveBeenCalledWith(expect.any(AdyenAuthenticationError), {
      id: mockedConfigurationId,
      name: "config-name",
    });
  });

  it("Reports permission problem when Adyen returns AdyenPermissionError", async () => {
    vi.spyOn(mockedAdyenPaymentIntentsApi, "cancelPaymentIntent").mockImplementationOnce(
      async () =>
        err(
          new Adyen.errors.AdyenPermissionError({
            type: "api_error",
            message: "Insufficient permissions",
          }),
        ),
    );

    const reportSpy = vi.spyOn(mockAdyenProblemReporter, "reportApiProblem");

    const uc = new TransactionCancelationRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
    });

    await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionCancelationRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    expect(reportSpy).toHaveBeenCalledWith(expect.any(AdyenPermissionError), {
      id: mockedConfigurationId,
      name: "config-name",
    });
  });

  it("Calls reportApiProblem with non-reportable error when Adyen returns other error", async () => {
    vi.spyOn(mockedAdyenPaymentIntentsApi, "cancelPaymentIntent").mockImplementationOnce(
      async () =>
        err(
          new Adyen.errors.AdyenAPIError({
            type: "api_error",
            message: "Something went wrong",
          }),
        ),
    );

    const reportSpy = vi.spyOn(mockAdyenProblemReporter, "reportApiProblem");

    const uc = new TransactionCancelationRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
    });

    await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionCancelationRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    expect(reportSpy).toHaveBeenCalledWith(expect.any(AdyenAPIError), {
      id: mockedConfigurationId,
      name: "config-name",
    });
  });
});
