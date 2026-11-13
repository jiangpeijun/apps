import { err } from "neverthrow";
import Adyen from "adyen";
import { describe, expect, it, vi } from "vitest";

import { mockedAppConfigRepo } from "@/__tests__/mocks/app-config-repo";
import { mockedConfigurationId, mockedSaleorAppId } from "@/__tests__/mocks/constants";
import { mockAdyenProblemReporter } from "@/__tests__/mocks/mock-adyen-problem-reporter";
import { mockedAdyenRefundsApi } from "@/__tests__/mocks/mocked-adyen-refunds-api";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { getMockedTransactionRefundRequestedEvent } from "@/__tests__/mocks/saleor-events/transaction-refund-request-event";
import {
  AdyenAPIError,
  AdyenAuthenticationError,
  AdyenPermissionError,
} from "@/modules/adyen/adyen-api-error";
import { type IAdyenRefundsApiFactory } from "@/modules/adyen/types";

import { TransactionRefundRequestedUseCase } from "./use-case";

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

describe("TransactionRefundRequestedUseCase - problem reporting", () => {
  const adyenRefundsApiFactory = {
    create: () => mockedAdyenRefundsApi,
  } satisfies IAdyenRefundsApiFactory;

  it("Reports authentication problem when Adyen returns AdyenAuthenticationError", async () => {
    vi.spyOn(mockedAdyenRefundsApi, "createRefund").mockImplementationOnce(async () =>
      err(
        new Adyen.errors.AdyenAuthenticationError({
          type: "authentication_error",
          message: "Invalid API key",
        }),
      ),
    );

    const reportSpy = vi.spyOn(mockAdyenProblemReporter, "reportApiProblem");

    const uc = new TransactionRefundRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenRefundsApiFactory,
    });

    await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionRefundRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    expect(reportSpy).toHaveBeenCalledWith(expect.any(AdyenAuthenticationError), {
      id: mockedConfigurationId,
      name: "config-name",
    });
  });

  it("Reports permission problem when Adyen returns AdyenPermissionError", async () => {
    vi.spyOn(mockedAdyenRefundsApi, "createRefund").mockImplementationOnce(async () =>
      err(
        new Adyen.errors.AdyenPermissionError({
          type: "api_error",
          message: "Insufficient permissions",
        }),
      ),
    );

    const reportSpy = vi.spyOn(mockAdyenProblemReporter, "reportApiProblem");

    const uc = new TransactionRefundRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenRefundsApiFactory,
    });

    await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionRefundRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    expect(reportSpy).toHaveBeenCalledWith(expect.any(AdyenPermissionError), {
      id: mockedConfigurationId,
      name: "config-name",
    });
  });

  it("Calls reportApiProblem with non-reportable error when Adyen returns other error", async () => {
    vi.spyOn(mockedAdyenRefundsApi, "createRefund").mockImplementationOnce(async () =>
      err(
        new Adyen.errors.AdyenAPIError({
          type: "api_error",
          message: "Something went wrong",
        }),
      ),
    );

    const reportSpy = vi.spyOn(mockAdyenProblemReporter, "reportApiProblem");

    const uc = new TransactionRefundRequestedUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenRefundsApiFactory,
    });

    await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionRefundRequestedEvent(),
      problemReporter: mockAdyenProblemReporter,
    });

    expect(reportSpy).toHaveBeenCalledWith(expect.any(AdyenAPIError), {
      id: mockedConfigurationId,
      name: "config-name",
    });
  });
});
