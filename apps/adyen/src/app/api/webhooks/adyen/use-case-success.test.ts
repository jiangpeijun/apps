import { type APL } from "@saleor/app-sdk/APL";
import { ok } from "neverthrow";
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
import {
  mockedAdyenCardPaymentMethod,
  mockedAdyenOtherPaymentMethod,
} from "@/__tests__/mocks/mocked-adyen-payment-method";
import { MockedTransactionRecorder } from "@/__tests__/mocks/mocked-transaction-recorder";
import { getMockedChargeRefundUpdatedEvent } from "@/__tests__/mocks/adyen-events/mocked-charge-refund-updated";
import { getMockedPaymentIntentAmountCapturableUpdatedEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-amount-capturable-updated";
import { getMockedPaymentIntentPaymentCanceledEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-canceled";
import { getMockedPaymentIntentPaymentFailedEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-failed";
import { getMockedPaymentIntentProcessingEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-processing";
import { getMockedPaymentIntentRequiresActionEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-requires-action";
import { getMockedPaymentIntentSucceededEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-succeeded";
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

const mockApl = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  getAll: vi.fn(),
} satisfies APL;

const eventVerify = {
  verifyEvent: vi.fn(),
} satisfies IAdyenEventVerify;

const webhookParams = WebhookParams.createFromWebhookUrl(mockAdyenWebhookUrl)._unsafeUnwrap();

const mockEventReporter = {
  reportTransactionEvent: vi.fn(),
} satisfies ITransactionEventReporter;

let instance: AdyenWebhookUseCase;

const mockTransactionRecorder = new MockedTransactionRecorder();

const adyenPaymentIntentsApiFactory = {
  create: () => mockedAdyenPaymentIntentsApi,
} satisfies IAdyenPaymentIntentsApiFactory;

describe("AdyenWebhookUseCase - handling payment_intent.success event", () => {
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

    vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(async () =>
      ok({
        payment_method: mockedAdyenCardPaymentMethod,
      }),
    );
  });

  it("Reports CHARGE_SUCCESS transaction event to Saleor when resolvedFlow is CHARGE", async () => {
    const event = getMockedPaymentIntentSucceededEvent();
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [
          "REFUND",
        ],
        "amount": SaleorMoney {
          "amount": 1.013,
          "currency": "IQD",
        },
        "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
        "message": "Payment intent has been successful",
        "pspReference": "pi_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": {
          "card": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
          },
        },
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "CHARGE_SUCCESS",
      }
    `,
    );
  });

  it("Reports CHARGE_SUCCESS transaction event to Saleor when resolvedFlow is AUTHORIZATION", async () => {
    const event = getMockedPaymentIntentSucceededEvent();
    const adyenPiId = createAdyenPaymentIntentId(event.data.object.id);

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    mockTransactionRecorder.transactions = {
      [adyenPiId]: new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId: adyenPiId,
        saleorTransactionFlow: createSaleorTransactionFlow("AUTHORIZATION"),
        resolvedTransactionFlow: createResolvedTransactionFlow("AUTHORIZATION"),
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [
          "REFUND",
        ],
        "amount": SaleorMoney {
          "amount": 1.013,
          "currency": "IQD",
        },
        "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
        "message": "Payment intent has been successful",
        "pspReference": "pi_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": {
          "card": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
          },
        },
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "CHARGE_SUCCESS",
      }
    `,
    );
  });
});

describe("AdyenWebhookUseCase - handling payment_intent.amount_capturable_updated event", () => {
  beforeEach(() => {
    mockApl.get.mockImplementation(async () => mockAuthData);
    mockTransactionRecorder.reset();
    vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(async () =>
      ok({
        payment_method: mockedAdyenOtherPaymentMethod,
      }),
    );

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

  it("Reports AUTHORIZATION_SUCCESS transaction event", async () => {
    const event = getMockedPaymentIntentAmountCapturableUpdatedEvent();

    const adyenPiId = createAdyenPaymentIntentId(event.data.object.id);

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    mockTransactionRecorder.transactions = {
      [adyenPiId]: new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId: adyenPiId,
        saleorTransactionFlow: createSaleorTransactionFlow("AUTHORIZATION"),
        resolvedTransactionFlow: createResolvedTransactionFlow("AUTHORIZATION"),
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [
          "CHARGE",
          "CANCEL",
        ],
        "amount": SaleorMoney {
          "amount": 10,
          "currency": "USD",
        },
        "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
        "message": "Payment intent has been successful",
        "pspReference": "pi_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": {
          "other": {
            "name": "sepa_debit",
          },
        },
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "AUTHORIZATION_SUCCESS",
      }
    `,
    );
  });
});

describe("AdyenWebhookUseCase - handling payment_intent.payment_failed event", () => {
  beforeEach(() => {
    mockApl.get.mockImplementation(async () => mockAuthData);
    mockTransactionRecorder.reset();

    vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(async () =>
      ok({
        payment_method: null,
      }),
    );

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

  it("Reports CHARGE_FAILED transaction event to Saleor when resolvedFlow in CHARGE", async () => {
    const event = getMockedPaymentIntentPaymentFailedEvent();
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [
          "CHARGE",
        ],
        "amount": SaleorMoney {
          "amount": 10,
          "currency": "USD",
        },
        "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
        "message": "Payment intent failed",
        "pspReference": "pi_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": null,
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "CHARGE_FAILURE",
      }
    `,
    );
  });

  it("Reports AUTHORIZATION_FAILED transaction event to Saleor when resolvedFlow in AUTHORIZATION", async () => {
    const event = getMockedPaymentIntentPaymentFailedEvent();
    const adyenPiId = createAdyenPaymentIntentId(event.data.object.id);

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    mockTransactionRecorder.transactions = {
      [adyenPiId]: new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId: adyenPiId,
        saleorTransactionFlow: createSaleorTransactionFlow("AUTHORIZATION"),
        resolvedTransactionFlow: createResolvedTransactionFlow("AUTHORIZATION"),
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [
          "CANCEL",
        ],
        "amount": SaleorMoney {
          "amount": 10,
          "currency": "USD",
        },
        "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
        "message": "Payment intent failed",
        "pspReference": "pi_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": null,
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "AUTHORIZATION_FAILURE",
      }
    `,
    );
  });
});

describe("AdyenWebhookUseCase - handling payment_intent.processing event", () => {
  beforeEach(() => {
    mockApl.get.mockImplementation(async () => mockAuthData);
    mockTransactionRecorder.reset();
    vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(async () =>
      ok({
        payment_method: mockedAdyenCardPaymentMethod,
      }),
    );

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

  it("Report CHARGE_REQUEST transaction event to Saleor when resolved flow is CHARGE", async () => {
    const event = getMockedPaymentIntentProcessingEvent();
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [],
        "amount": SaleorMoney {
          "amount": 1013,
          "currency": "JPY",
        },
        "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
        "message": "Payment intent is processing",
        "pspReference": "pi_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": {
          "card": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
          },
        },
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "CHARGE_REQUEST",
      }
    `,
    );
  });

  it("Report AUTHORIZATION_REQUEST transaction event to Saleor when resolved flow is AUTHORIZATION", async () => {
    const event = getMockedPaymentIntentProcessingEvent();
    const adyenPiId = createAdyenPaymentIntentId(event.data.object.id);

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    mockTransactionRecorder.transactions = {
      [adyenPiId]: new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId: adyenPiId,
        saleorTransactionFlow: createSaleorTransactionFlow("AUTHORIZATION"),
        resolvedTransactionFlow: createResolvedTransactionFlow("AUTHORIZATION"),
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [],
        "amount": SaleorMoney {
          "amount": 1013,
          "currency": "JPY",
        },
        "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
        "message": "Payment intent is processing",
        "pspReference": "pi_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": {
          "card": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
          },
        },
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "AUTHORIZATION_REQUEST",
      }
    `,
    );
  });
});

describe("AdyenWebhookUseCase - handling payment_intent.requires_action event", () => {
  beforeEach(() => {
    mockApl.get.mockImplementation(async () => mockAuthData);
    mockTransactionRecorder.reset();
    vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(async () =>
      ok({
        payment_method: mockedAdyenCardPaymentMethod,
      }),
    );

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

  it("Reports CHARGE_ACTION_REQUIRED transaction event to Saleor when resolved flow is CHARGE", async () => {
    const event = getMockedPaymentIntentRequiresActionEvent();
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [
          "CANCEL",
        ],
        "amount": SaleorMoney {
          "amount": 0.1,
          "currency": "UYW",
        },
        "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
        "message": "Payment intent requires action",
        "pspReference": "pi_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": {
          "card": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
          },
        },
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "CHARGE_ACTION_REQUIRED",
      }
    `,
    );
  });

  it("Reports AUTHORIZATION_ACTION_REQUIRED transaction event to Saleor when resolved flow in AUTHORIZATION", async () => {
    const event = getMockedPaymentIntentRequiresActionEvent();
    const adyenPiId = createAdyenPaymentIntentId(event.data.object.id);

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    mockTransactionRecorder.transactions = {
      [adyenPiId]: new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId: adyenPiId,
        saleorTransactionFlow: createSaleorTransactionFlow("AUTHORIZATION"),
        resolvedTransactionFlow: createResolvedTransactionFlow("AUTHORIZATION"),
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [
          "CANCEL",
        ],
        "amount": SaleorMoney {
          "amount": 0.1,
          "currency": "UYW",
        },
        "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
        "message": "Payment intent requires action",
        "pspReference": "pi_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": {
          "card": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
          },
        },
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "AUTHORIZATION_ACTION_REQUIRED",
      }
    `,
    );
  });
});

describe("AdyenWebhookUseCase - handling payment_intent.canceled event", () => {
  beforeEach(() => {
    mockApl.get.mockImplementation(async () => mockAuthData);
    mockTransactionRecorder.reset();
    vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(async () =>
      ok({
        payment_method: mockedAdyenCardPaymentMethod,
      }),
    );

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

  it("Reports CANCEL_SUCCESS transaction event to Saleor and resolvedFlow is CHARGE", async () => {
    const event = getMockedPaymentIntentPaymentCanceledEvent();
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [],
        "amount": SaleorMoney {
          "amount": 10,
          "currency": "USD",
        },
        "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
        "message": "Payment intent was cancelled",
        "pspReference": "pi_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": {
          "card": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
          },
        },
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "CANCEL_SUCCESS",
      }
    `,
    );
  });

  it("Reports CANCEL_SUCCESS transaction event to Saleor and resolvedFlow is AUTHORIZATION", async () => {
    const event = getMockedPaymentIntentPaymentCanceledEvent();
    const adyenPiId = createAdyenPaymentIntentId(event.data.object.id);

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    mockTransactionRecorder.transactions = {
      [adyenPiId]: new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId: adyenPiId,
        saleorTransactionFlow: createSaleorTransactionFlow("AUTHORIZATION"),
        resolvedTransactionFlow: createResolvedTransactionFlow("AUTHORIZATION"),
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [],
        "amount": SaleorMoney {
          "amount": 10,
          "currency": "USD",
        },
        "externalUrl": "https://dashboard.adyen.com/payments/pi_TEST_TEST_TEST",
        "message": "Payment intent was cancelled",
        "pspReference": "pi_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": {
          "card": {
            "brand": "visa",
            "expMonth": 12,
            "expYear": 2025,
            "lastDigits": "4242",
            "name": "Visa",
          },
        },
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "CANCEL_SUCCESS",
      }
    `,
    );
  });
});

describe("AdyenWebhookUseCase - handling charge.refund.updated event", () => {
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

  it("Reports REFUND_SUCCESS transaction event when refund has status: success", async () => {
    const event = getMockedChargeRefundUpdatedEvent();

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    mockTransactionRecorder.transactions = {
      [mockedAdyenPaymentIntentId]: new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [
          "REFUND",
        ],
        "amount": SaleorMoney {
          "amount": 10,
          "currency": "USD",
        },
        "externalUrl": "https://dashboard.adyen.com/refunds/re_TEST_TEST_TEST",
        "message": "Refund was successful",
        "pspReference": "re_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": null,
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "REFUND_SUCCESS",
      }
    `,
    );
  });

  it("Reports REFUND_FAILURE transaction event when refund has status: failed", async () => {
    const event = getMockedChargeRefundUpdatedEvent({
      status: "failed",
    });

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    mockTransactionRecorder.transactions = {
      [mockedAdyenPaymentIntentId]: new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [
          "REFUND",
        ],
        "amount": SaleorMoney {
          "amount": 10,
          "currency": "USD",
        },
        "externalUrl": "https://dashboard.adyen.com/refunds/re_TEST_TEST_TEST",
        "message": "Refund failed",
        "pspReference": "re_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": null,
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "REFUND_FAILURE",
      }
    `,
    );
  });

  it("Reports REFUND_REQUEST transaction event when refund has status: pending", async () => {
    const event = getMockedChargeRefundUpdatedEvent({
      status: "pending",
    });

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    mockTransactionRecorder.transactions = {
      [mockedAdyenPaymentIntentId]: new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId: mockedAdyenPaymentIntentId,
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

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).toHaveBeenCalledOnce();

    expect(
      vi.mocked(mockEventReporter.reportTransactionEvent).mock.calls[0][0],
    ).toMatchInlineSnapshot(
      {
        time: expect.toSatisfy(
          (d) => new Date(d).getTime() === new Date(event.data.object.created * 1000).getTime(),
        ),
      },
      `
      {
        "actions": [],
        "amount": SaleorMoney {
          "amount": 10,
          "currency": "USD",
        },
        "externalUrl": "https://dashboard.adyen.com/refunds/re_TEST_TEST_TEST",
        "message": "Refund is processing",
        "pspReference": "re_TEST_TEST_TEST",
        "saleorPaymentMethodDetailsInput": null,
        "time": toSatisfy<[Function anonymous]>,
        "transactionId": "mocked-transaction-id",
        "type": "REFUND_REQUEST",
      }
    `,
    );
  });
});

describe("AdyenWebhookUseCase - handling events without metadata created by Saleor", () => {
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

  it("Acknowledges with 200 to Adyen if metadata is missing for payment_intent.succeeded event", async () => {
    const event = getMockedPaymentIntentSucceededEvent();

    event.data.object.metadata = {};

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    const reportProblemSpy = vi.spyOn(
      AdyenProblemReporter.prototype,
      "reportObjectFromDifferentInstallation",
    );

    const result = await instance.execute({
      rawBody: "TEST BODY",
      signatureHeader: "SIGNATURE",
      webhookParams: webhookParams,
    });

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).not.toHaveBeenCalled();
    expect(reportProblemSpy).not.toHaveBeenCalled();
  });

  it("Acknowledges with 200 to Adyen if metadata is missing for charge.refund.updated event", async () => {
    const event = getMockedChargeRefundUpdatedEvent();

    event.data.object.metadata = {};

    eventVerify.verifyEvent.mockImplementationOnce(() => ok(event));

    const reportProblemSpy = vi.spyOn(
      AdyenProblemReporter.prototype,
      "reportObjectFromDifferentInstallation",
    );

    const result = await instance.execute({
      rawBody: "TEST BODY",
      signatureHeader: "SIGNATURE",
      webhookParams: webhookParams,
    });

    expect(result._unsafeUnwrap()).toMatchInlineSnapshot(`
      AdyenWebhookSuccessResponse {
        "message": "Ok",
        "statusCode": 200,
      }
    `);

    expect(mockEventReporter.reportTransactionEvent).not.toHaveBeenCalled();
    expect(reportProblemSpy).not.toHaveBeenCalled();
  });
});
