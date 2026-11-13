import { type APL } from "@saleor/app-sdk/APL";
import { err, ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockedAppConfigRepo } from "@/__tests__/mocks/app-config-repo";
import { mockAdyenWebhookUrl } from "@/__tests__/mocks/constants";
import { mockAuthData } from "@/__tests__/mocks/mock-auth-data";
import { mockedAdyenConfig } from "@/__tests__/mocks/mock-adyen-config";
import { mockedAdyenPaymentIntentsApi } from "@/__tests__/mocks/mocked-adyen-payment-intents-api";
import { MockedTransactionRecorder } from "@/__tests__/mocks/mocked-transaction-recorder";
import { BaseError } from "@/lib/errors";
import { AdyenProblemReporter } from "@/modules/app-problems";
import { type ITransactionEventReporter } from "@/modules/saleor/transaction-event-reporter";
import {
  AdyenWebhookManager,
  AdyenWebhookManagerErrors,
} from "@/modules/adyen/adyen-webhook-manager";
import {
  type IAdyenEventVerify,
  type IAdyenPaymentIntentsApiFactory,
} from "@/modules/adyen/types";

import { AdyenWebhookUseCase } from "./use-case";
import { WebhookParams } from "./webhook-params";

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

vi.mock("next/server", () => ({
  after: (callback: () => unknown) => callback(),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("AdyenWebhookUseCase - Legacy event cases", () => {
  const rawEventBody = JSON.stringify({ id: 1 });

  const mockApl = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(),
  } satisfies APL;

  let instance: AdyenWebhookUseCase;

  const eventVerify = {
    verifyEvent: vi.fn(),
  } satisfies IAdyenEventVerify;

  const webhookParams = WebhookParams.createFromWebhookUrl(mockAdyenWebhookUrl)._unsafeUnwrap();

  const mockEventReporter = {
    reportTransactionEvent: vi.fn(),
  } satisfies ITransactionEventReporter;

  const mockTransactionRecorder = new MockedTransactionRecorder();

  const webhookManager = new AdyenWebhookManager();

  const adyenPaymentIntentsApiFactory = {
    create: () => mockedAdyenPaymentIntentsApi,
  } satisfies IAdyenPaymentIntentsApiFactory;

  beforeEach(() => {
    vi.spyOn(webhookManager, "removeWebhook");

    mockApl.get.mockImplementation(async () => {
      return { ...mockAuthData, appId: "different-app-id" };
    });

    mockTransactionRecorder.reset();

    instance = new AdyenWebhookUseCase({
      apl: mockApl,
      appConfigRepo: mockedAppConfigRepo,
      webhookEventVerifyFactory: () => eventVerify,
      transactionEventReporterFactory() {
        return mockEventReporter;
      },
      problemReporterFactory: () => new AdyenProblemReporter({} as never),
      transactionRecorder: mockTransactionRecorder,
      webhookManager,
      adyenPaymentIntentsApiFactory,
    });
  });

  describe("Once event received comes from different app ID than currently resolved from AuthData", () => {
    it("Will remove webhook and return 200 to Adyen", async () => {
      vi.mocked(webhookManager.removeWebhook).mockImplementationOnce(async () => ok(null));

      const result = await instance.execute({
        rawBody: rawEventBody,
        webhookParams: webhookParams,
        signatureHeader: "",
      });

      expect(webhookManager.removeWebhook).toHaveBeenCalledExactlyOnceWith({
        restrictedKey: mockedAdyenConfig.restrictedKey,
        webhookId: mockedAdyenConfig.webhookId,
      });

      expect(result.isOk()).toBe(true);

      expect(mockedAppConfigRepo.getAdyenConfig).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          appId: webhookParams.appId,
        }),
      );
    });

    it("Will return 500 to Adyen and report AppProblem if legacy config matching legacy event not found", async () => {
      vi.mocked(mockedAppConfigRepo.getAdyenConfig).mockImplementationOnce(async () => ok(null));
      const reportSpy = vi.spyOn(AdyenProblemReporter.prototype, "reportLegacyWebhookOrphaned");

      const result = await instance.execute({
        rawBody: rawEventBody,
        webhookParams: webhookParams,
        signatureHeader: "",
      });

      expect(result.isErr()).toBe(true);

      expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
        AdyenWebhookAppIsNotConfiguredResponse {
          "message": "App is not configured",
          "statusCode": 400,
        }
      `);

      expect(mockedAppConfigRepo.getAdyenConfig).toHaveBeenCalledOnce();
      expect(reportSpy).toHaveBeenCalledExactlyOnceWith(webhookParams.configurationId);
    });

    it("Will return 500 to Adyen if can't access DB to fetch config", async () => {
      vi.mocked(mockedAppConfigRepo.getAdyenConfig).mockImplementationOnce(async () =>
        err(new BaseError("test err")),
      );

      const result = await instance.execute({
        rawBody: rawEventBody,
        webhookParams: webhookParams,
        signatureHeader: "",
      });

      expect(result.isErr()).toBe(true);

      expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
        AdyenWebhookAppIsNotConfiguredResponse {
          "message": "App is not configured",
          "statusCode": 400,
        }
      `);

      expect(mockedAppConfigRepo.getAdyenConfig).toHaveBeenCalledOnce();
    });

    it("Will return 500 to Adyen if can't remove webhook for some reason", async () => {
      vi.mocked(webhookManager.removeWebhook).mockImplementationOnce(async () =>
        err(new AdyenWebhookManagerErrors.CantRemoveWebhookError("error removing webhook")),
      );

      const result = await instance.execute({
        rawBody: rawEventBody,
        webhookParams: webhookParams,
        signatureHeader: "",
      });

      expect(result.isErr()).toBe(true);

      expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
        AdyenWebhookAppIsNotConfiguredResponse {
          "message": "App is not configured",
          "statusCode": 400,
        }
      `);

      expect(mockedAppConfigRepo.getAdyenConfig).toHaveBeenCalledOnce();
    });
  });
});
