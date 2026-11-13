import { type APL } from "@saleor/app-sdk/APL";
import { err, ok } from "neverthrow";
import type Adyen from "adyen";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockedAppConfigRepo } from "@/__tests__/mocks/app-config-repo";
import {
  mockAdyenWebhookUrl,
  mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
  mockedSaleorTransactionId,
} from "@/__tests__/mocks/constants";
import { mockAuthData } from "@/__tests__/mocks/mock-auth-data";
import { mockedAdyenPaymentIntentId } from "@/__tests__/mocks/mocked-adyen-payment-intent-id";
import { mockedAdyenPaymentIntentsApi } from "@/__tests__/mocks/mocked-adyen-payment-intents-api";
import { MockedTransactionRecorder } from "@/__tests__/mocks/mocked-transaction-recorder";
import { getMockedPaymentIntentSucceededEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-succeeded";
import { BaseError } from "@/lib/errors";
import { AdyenProblemReporter } from "@/modules/app-problems";
import { createResolvedTransactionFlow } from "@/modules/resolved-transaction-flow";
import { createSaleorTransactionFlow } from "@/modules/saleor/saleor-transaction-flow";
import {
  type ITransactionEventReporter,
  type TransactionEventReportResultResult,
} from "@/modules/saleor/transaction-event-reporter";
import { createAdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";
import { AdyenWebhookManager } from "@/modules/adyen/adyen-webhook-manager";
import {
  type IAdyenEventVerify,
  type IAdyenPaymentIntentsApiFactory,
  AdyenEventParsingError,
} from "@/modules/adyen/types";
import { RecordedTransaction } from "@/modules/transactions-recording/domain/recorded-transaction";

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

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("AdyenWebhookUseCase - Error cases", () => {
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

  const adyenPaymentIntentsApiFactory = {
    create: () => mockedAdyenPaymentIntentsApi,
  } satisfies IAdyenPaymentIntentsApiFactory;

  beforeEach(() => {
    mockApl.get.mockImplementation(async () => mockAuthData);
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
      webhookManager: new AdyenWebhookManager(),
      adyenPaymentIntentsApiFactory,
    });
  });

  it("Returns error when AuthData not found", async () => {
    mockApl.get.mockImplementationOnce(async () => undefined);

    const result = await instance.execute({
      rawBody: rawEventBody,
      signatureHeader: "test-signature",
      webhookParams: webhookParams,
    });

    expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
      AdyenWebhookAppIsNotConfiguredResponse {
        "message": "App is not configured",
        "statusCode": 400,
      }
    `);
  });

  it("Returns error when Config can not be fetched", async () => {
    vi.spyOn(mockedAppConfigRepo, "getAdyenConfig").mockImplementationOnce(async () =>
      err(new BaseError("Test error - cant fetch config")),
    );

    const result = await instance.execute({
      rawBody: rawEventBody,
      signatureHeader: "test-signature",
      webhookParams: webhookParams,
    });

    expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
      AdyenWebhookAppIsNotConfiguredResponse {
        "message": "App is not configured",
        "statusCode": 400,
      }
    `);
  });

  it("Returns error when Config for specific channel is empty", async () => {
    vi.spyOn(mockedAppConfigRepo, "getAdyenConfig").mockImplementationOnce(async () => ok(null));

    const result = await instance.execute({
      rawBody: rawEventBody,
      signatureHeader: "test-signature",
      webhookParams: webhookParams,
    });

    expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
      AdyenWebhookAppIsNotConfiguredResponse {
        "message": "App is not configured",
        "statusCode": 400,
      }
    `);
  });

  it("Returns error when event from Adyen can not be parsed", async () => {
    eventVerify.verifyEvent.mockImplementationOnce(() =>
      err(new AdyenEventParsingError("Error because its test")),
    );

    const result = await instance.execute({
      rawBody: rawEventBody,
      signatureHeader: "test-signature",
      webhookParams: webhookParams,
    });

    expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
      AdyenWebhookMalformedRequestResponse {
        "message": "Malformed request",
        "statusCode": 400,
      }
    `);
  });

  it("Returns error if transaction not previously recorded", async () => {
    eventVerify.verifyEvent.mockImplementationOnce(() =>
      ok(getMockedPaymentIntentSucceededEvent()),
    );

    const result = await instance.execute({
      rawBody: rawEventBody,
      signatureHeader: "test-signature",
      webhookParams: webhookParams,
    });

    expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
      AdyenWebhookTransactionMissingResponse {
        "message": "Transaction is missing",
        "statusCode": 400,
      }
    `);
  });

  it("Acknowledges with 200 if payment_intent belongs to a different Saleor installation and does not call DB", async () => {
    const event = getMockedPaymentIntentSucceededEvent();

    event.data.object.metadata = {
      saleor_transaction_id: mockedSaleorTransactionId as string,
      saleor_source_id: "checkout-id-123",
      saleor_source_type: "Checkout",
      saleor_app_id: "different-app-id",
    };

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    const dbSpy = vi.spyOn(mockTransactionRecorder, "getTransactionByAdyenPaymentIntentId");

    const reportProblemSpy = vi
      .spyOn(AdyenProblemReporter.prototype, "reportObjectFromDifferentInstallation")
      .mockResolvedValue();

    const result = await instance.execute({
      rawBody: rawEventBody,
      signatureHeader: "test-signature",
      webhookParams: webhookParams,
    });

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(dbSpy).not.toHaveBeenCalled();
    expect(mockEventReporter.reportTransactionEvent).not.toHaveBeenCalled();
    expect(reportProblemSpy).toHaveBeenCalledWith(webhookParams.configurationId, "config-name");
  });

  it("Acknowledges with 200 if refund belongs to a different Saleor installation and does not call DB", async () => {
    const event = {
      type: "charge.refund.updated",
      data: {
        object: {
          object: "refund",
          id: "re_id",
          payment_intent: mockedAdyenPaymentIntentId.toString(),
          metadata: {
            saleor_transaction_id: mockedSaleorTransactionId as string,
            saleor_source_id: "checkout-id-123",
            saleor_source_type: "Checkout",
            saleor_app_id: "different-app-id",
          },
        },
      },
    } as unknown as Adyen.ChargeRefundUpdatedEvent;

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    const dbSpy = vi.spyOn(mockTransactionRecorder, "getTransactionByAdyenPaymentIntentId");

    const reportProblemSpy = vi
      .spyOn(AdyenProblemReporter.prototype, "reportObjectFromDifferentInstallation")
      .mockResolvedValue();

    const result = await instance.execute({
      rawBody: rawEventBody,
      signatureHeader: "test-signature",
      webhookParams: webhookParams,
    });

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(dbSpy).not.toHaveBeenCalled();
    expect(mockEventReporter.reportTransactionEvent).not.toHaveBeenCalled();
    expect(reportProblemSpy).toHaveBeenCalledWith(webhookParams.configurationId, "config-name");
  });

  it("Processes payment_intent without saleor_app_id for backward compatibility", async () => {
    const event = getMockedPaymentIntentSucceededEvent();

    // Metadata has saleor_transaction_id but no saleor_app_id (old PI)
    event.data.object.metadata = {
      saleor_transaction_id: mockedSaleorTransactionId as string,
      saleor_source_id: "checkout-id-123",
      saleor_source_type: "Checkout",
    };

    const adyenPiId = createAdyenPaymentIntentId(event.data.object.id);

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    mockTransactionRecorder.transactions = {
      [adyenPiId]: new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId: adyenPiId,
        saleorTransactionFlow: createSaleorTransactionFlow("CHARGE"),
        resolvedTransactionFlow: createResolvedTransactionFlow("CHARGE"),
        selectedPaymentMethod: "card",
        saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      }),
    };

    vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(async () =>
      ok({
        payment_method: null,
      }),
    );

    mockEventReporter.reportTransactionEvent.mockImplementationOnce(async () => {
      const data: TransactionEventReportResultResult = {
        createdEventId: "TEST_EVENT_ID",
      };

      return ok(data);
    });

    const result = await instance.execute({
      rawBody: "TEST BODY",
      signatureHeader: "SIGNATURE",
      webhookParams: webhookParams,
    });

    // Should NOT be rejected - backward compatible
    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);
  });

  it("Returns error if event is not supported by AdyenPaymentIntentHandler", async () => {
    const event = {
      type: "payment_intent.created",
      data: {
        object: {
          object: "payment_intent",
          id: mockedAdyenPaymentIntentId.toString(),
          metadata: {
            saleor_transaction_id: mockedSaleorTransactionId as string,
            saleor_source_id: "checkout-id-123",
            saleor_source_type: "Checkout",
          },
        },
      },
    } as unknown as Adyen.PaymentIntentCreatedEvent;

    const adyenPiId = mockedAdyenPaymentIntentId;

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    mockTransactionRecorder.transactions = {
      [adyenPiId]: new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId: adyenPiId,
        saleorTransactionFlow: createSaleorTransactionFlow("CHARGE"),
        resolvedTransactionFlow: createResolvedTransactionFlow("CHARGE"),
        selectedPaymentMethod: "card",
        saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      }),
    };

    mockEventReporter.reportTransactionEvent.mockImplementationOnce(async () => {
      const data: TransactionEventReportResultResult = {
        createdEventId: "TEST_EVENT_ID",
      };

      return ok(data);
    });

    const result = await instance.execute({
      rawBody: "TEST BODY",
      signatureHeader: "SIGNATURE",
      webhookParams: webhookParams,
    });

    expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
      AdyenWebhookSeverErrorResponse {
        "message": "Server error",
        "statusCode": 500,
      }
    `);
  });

  it("Returns error if event is not supported by AdyenRefundHandler", async () => {
    const event = {
      type: "refund.created",
      data: {
        object: {
          object: "refund",
          id: "re_id",
          payment_intent: mockedAdyenPaymentIntentId.toString(),
          metadata: {
            saleor_transaction_id: mockedSaleorTransactionId as string,
            saleor_source_id: "checkout-id-123",
            saleor_source_type: "Checkout",
          },
        },
      },
    } as unknown as Adyen.RefundCreatedEvent;

    const adyenPiId = mockedAdyenPaymentIntentId;

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    mockTransactionRecorder.transactions = {
      [adyenPiId]: new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId: adyenPiId,
        saleorTransactionFlow: createSaleorTransactionFlow("CHARGE"),
        resolvedTransactionFlow: createResolvedTransactionFlow("CHARGE"),
        selectedPaymentMethod: "card",
        saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      }),
    };

    mockEventReporter.reportTransactionEvent.mockImplementationOnce(async () => {
      const data: TransactionEventReportResultResult = {
        createdEventId: "TEST_EVENT_ID",
      };

      return ok(data);
    });

    const result = await instance.execute({
      rawBody: "TEST BODY",
      signatureHeader: "SIGNATURE",
      webhookParams: webhookParams,
    });

    expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
      AdyenWebhookSeverErrorResponse {
        "message": "Server error",
        "statusCode": 500,
      }
    `);
  });
});
