import { err } from "neverthrow";
import Adyen from "adyen";
import { describe, expect, it, vi } from "vitest";

import { mockedAppConfigRepo } from "@/__tests__/mocks/app-config-repo";
import {
  mockedConfigurationId,
  mockedSaleorAppId,
  mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
} from "@/__tests__/mocks/constants";
import { mockAdyenProblemReporter } from "@/__tests__/mocks/mock-adyen-problem-reporter";
import { mockedAdyenPaymentIntentsApi } from "@/__tests__/mocks/mocked-adyen-payment-intents-api";
import { MockedTransactionRecorder } from "@/__tests__/mocks/mocked-transaction-recorder";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { getMockedTransactionInitializeSessionEvent } from "@/__tests__/mocks/saleor-events/transaction-initialize-session-event";
import {
  AdyenAPIError,
  AdyenAuthenticationError,
  AdyenPermissionError,
} from "@/modules/adyen/adyen-api-error";
import { type IAdyenPaymentIntentsApiFactory } from "@/modules/adyen/types";

import { TransactionInitializeSessionUseCase } from "./use-case";

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

describe("TransactionInitializeSessionUseCase - problem reporting", () => {
  const adyenPaymentIntentsApiFactory = {
    create: () => mockedAdyenPaymentIntentsApi,
  } satisfies IAdyenPaymentIntentsApiFactory;

  it("Reports authentication problem when Adyen returns AdyenAuthenticationError", async () => {
    vi.spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent").mockImplementationOnce(
      async () =>
        err(
          new Adyen.errors.AdyenAuthenticationError({
            type: "authentication_error",
            message: "Invalid API key",
          }),
        ),
    );

    const reportSpy = vi.spyOn(mockAdyenProblemReporter, "reportApiProblem");

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionInitializeSessionEvent(),
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(reportSpy).toHaveBeenCalledWith(expect.any(AdyenAuthenticationError), {
      id: mockedConfigurationId,
      name: "config-name",
    });
  });

  it("Reports permission problem when Adyen returns AdyenPermissionError", async () => {
    vi.spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent").mockImplementationOnce(
      async () =>
        err(
          new Adyen.errors.AdyenPermissionError({
            type: "api_error",
            message: "Insufficient permissions",
          }),
        ),
    );

    const reportSpy = vi.spyOn(mockAdyenProblemReporter, "reportApiProblem");

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionInitializeSessionEvent(),
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(reportSpy).toHaveBeenCalledWith(expect.any(AdyenPermissionError), {
      id: mockedConfigurationId,
      name: "config-name",
    });
  });

  it("Calls reportApiProblem with non-reportable error when Adyen returns other error", async () => {
    vi.spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent").mockImplementationOnce(
      async () =>
        err(
          new Adyen.errors.AdyenAPIError({
            type: "api_error",
            message: "Something went wrong",
          }),
        ),
    );

    const reportSpy = vi.spyOn(mockAdyenProblemReporter, "reportApiProblem");

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionInitializeSessionEvent(),
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(reportSpy).toHaveBeenCalledWith(expect.any(AdyenAPIError), {
      id: mockedConfigurationId,
      name: "config-name",
    });
  });

  it("Reports invalid payment method problem when event data contains unsupported payment method", async () => {
    const reportSpy = vi.spyOn(mockAdyenProblemReporter, "reportInvalidPaymentMethod");

    const eventWithUnsupportedPaymentMethod = {
      ...getMockedTransactionInitializeSessionEvent(),
      data: {
        paymentIntent: {
          paymentMethod: "not-supported-payment-method",
        },
      },
    };

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: eventWithUnsupportedPaymentMethod,
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(reportSpy).toHaveBeenCalledWith("channel-slug");
  });

  it("Does not report invalid payment method problem when event data parsing fails for other reasons", async () => {
    const reportSpy = vi.spyOn(mockAdyenProblemReporter, "reportInvalidPaymentMethod");

    const eventWithAdditionalField = {
      ...getMockedTransactionInitializeSessionEvent(),
      data: {
        paymentIntent: {
          paymentMethod: "card",
          additionalField: "value",
        },
      },
    };

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: eventWithAdditionalField,
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(reportSpy).not.toHaveBeenCalled();
  });
});
