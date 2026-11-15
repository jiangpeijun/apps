// apps\adyen\src\app\api\webhooks\saleor\transaction-initialize-session\use-case.test.ts
import { err, ok } from "neverthrow";
import type Adyen from "adyen";
import { describe, expect, it, vi } from "vitest";

import { mockedAppConfigRepo } from "@/__tests__/mocks/app-config-repo";
import {
  mockedSaleorAppId,
  mockedSaleorChannelId,
  mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
} from "@/__tests__/mocks/constants";
import { mockAdyenProblemReporter } from "@/__tests__/mocks/mock-adyen-problem-reporter";
import { mockedAdyenPaymentIntentsApi } from "@/__tests__/mocks/mocked-adyen-payment-intents-api";
import { MockedTransactionRecorder } from "@/__tests__/mocks/mocked-transaction-recorder";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { getMockedTransactionInitializeSessionEvent } from "@/__tests__/mocks/saleor-events/transaction-initialize-session-event";
import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
  MalformedRequestResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { AdyenAPIError } from "@/modules/adyen/adyen-api-error";
import { AdyenMoney } from "@/modules/adyen/adyen-money";
import { type IAdyenPaymentIntentsApiFactory } from "@/modules/adyen/types";
import {
  AuthorizationActionRequiredResult,
  ChargeActionRequiredResult,
} from "@/modules/transaction-result/action-required-result";
import {
  AuthorizationFailureResult,
  ChargeFailureResult,
} from "@/modules/transaction-result/failure-result";
import { TransactionRecorderError } from "@/modules/transactions-recording/repositories/transaction-recorder-repo";

import { TransactionInitializeSessionUseCase } from "./use-case";
import { TransactionInitializeSessionUseCaseResponses } from "./use-case-response";

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

describe("TransactionInitializeSessionUseCase", () => {
  const adyenPaymentIntentsApiFactory = {
    create: () => mockedAdyenPaymentIntentsApi,
  } satisfies IAdyenPaymentIntentsApiFactory;

  it.each([
    {
      actionType: "CHARGE" as const,
      captureMethod: undefined,
    },
    {
      actionType: "AUTHORIZATION" as const,
      captureMethod: "manual",
    },
  ])(
    "Calls Adyen PaymentIntentsAPI to create payment intent with $captureMethod capture method for card when actionType is $actionType",
    async ({ actionType, captureMethod }) => {
      const saleorEvent = getMockedTransactionInitializeSessionEvent({ actionType });

      const spy = vi
        .spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent")
        .mockImplementationOnce(async () =>
          ok({
            amount: 100,
            currency: "usd",
            client_secret: "secret-value",
            id: "pi_test",
            status: "requires_payment_method",
          } as Adyen.PaymentIntent),
        );

      const uc = new TransactionInitializeSessionUseCase({
        appConfigRepo: mockedAppConfigRepo,
        adyenPaymentIntentsApiFactory,
        transactionRecorder: new MockedTransactionRecorder(),
      });

      await uc.execute({
        saleorApiUrl: mockedSaleorApiUrl,
        appId: mockedSaleorAppId,
        event: saleorEvent,
        saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
        problemReporter: mockAdyenProblemReporter,
      });

      expect(spy).toHaveBeenCalledWith({
        adyenMoney: expect.any(AdyenMoney),
        idempotencyKey: saleorEvent.idempotencyKey,
        intentParams: {
          automatic_payment_methods: {
            enabled: true,
          },
          payment_method_options: {
            card: {
              capture_method: captureMethod,
            },
          },
        },
        metadata: {
          saleor_source_id: saleorEvent.sourceObject.id,
          saleor_source_type: saleorEvent.sourceObject.__typename,
          saleor_transaction_id: saleorEvent.transaction.id,
          saleor_api_url: mockedSaleorApiUrl,
          saleor_app_id: mockedSaleorAppId,
          saleor_checkout_id: saleorEvent.sourceObject.id,
        },
      });

      expect(spy.mock.calls[0][0].adyenMoney.amount).toBe(10000);
      expect(spy.mock.calls[0][0].adyenMoney.currency).toBe("usd");
    },
  );

  it("Adds Saleor order number to payment intent metadata and description when source object is Order", async () => {
    const saleorEvent = {
      ...getMockedTransactionInitializeSessionEvent(),
      sourceObject: {
        __typename: "Order" as const,
        id: "order-id",
        number: "123",
        checkoutId: "checkout-id",
        channel: {
          id: mockedSaleorChannelId,
          slug: "channel-slug",
        },
      },
    };

    const spy = vi
      .spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent")
      .mockImplementationOnce(async () =>
        ok({
          amount: 100,
          currency: "usd",
          client_secret: "secret-value",
          id: "pi_test",
          status: "requires_payment_method",
        } as Adyen.PaymentIntent),
      );

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: saleorEvent,
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    const args = spy.mock.calls[0][0];

    expect(args.intentParams.description).toBe("Saleor Order #123");
    expect(args.metadata).toStrictEqual(
      expect.objectContaining({
        saleor_source_id: "order-id",
        saleor_source_type: "Order",
        saleor_order_id: "order-id",
        saleor_order_number: "123",
        saleor_checkout_id: "checkout-id",
      }),
    );
  });

  it.each([
    {
      actionType: "CHARGE" as const,
      expectedSuccessResponse: TransactionInitializeSessionUseCaseResponses.Success,
      expectedResultType: ChargeActionRequiredResult,
    },
    {
      actionType: "AUTHORIZATION" as const,
      expectedSuccessResponse: TransactionInitializeSessionUseCaseResponses.Success,
      expectedResultType: AuthorizationActionRequiredResult,
    },
  ])(
    "Returns $expectedSuccessResponse.name response with $expectedResultType.name result if Adyen PaymentIntentsAPI successfully responds and actionType is $actionType",
    async ({ actionType, expectedSuccessResponse, expectedResultType }) => {
      const saleorEvent = getMockedTransactionInitializeSessionEvent({ actionType });

      vi.spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent").mockImplementationOnce(
        async () =>
          ok({
            amount: 100,
            currency: "usd",
            client_secret: "secret-value",
            id: "pi_test",
            status: "requires_payment_method",
          } as Adyen.PaymentIntent),
      );
      const uc = new TransactionInitializeSessionUseCase({
        appConfigRepo: mockedAppConfigRepo,
        adyenPaymentIntentsApiFactory,
        transactionRecorder: new MockedTransactionRecorder(),
      });

      const responsePayload = await uc.execute({
        saleorApiUrl: mockedSaleorApiUrl,
        appId: mockedSaleorAppId,
        event: saleorEvent,
        saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
        problemReporter: mockAdyenProblemReporter,
      });

      expect(responsePayload._unsafeUnwrap()).toBeInstanceOf(expectedSuccessResponse);
      expect(responsePayload._unsafeUnwrap().transactionResult).toBeInstanceOf(expectedResultType);
    },
  );

  it("Returns 'MissingConfigErrorResponse' if config not found for specified channel", async () => {
    const spy = vi
      .spyOn(mockedAppConfigRepo, "getAdyenConfig")
      .mockImplementationOnce(async () => ok(null));

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    const responsePayload = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: getMockedTransactionInitializeSessionEvent(),
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    const err = responsePayload._unsafeUnwrapErr();

    expect(spy).toHaveBeenCalledOnce();

    expect(err).toBeInstanceOf(AppIsNotConfiguredResponse);
  });

  it.each([
    {
      actionType: "CHARGE" as const,
      expectedFailureResponse: TransactionInitializeSessionUseCaseResponses.Failure,
      expectedResultType: ChargeFailureResult,
    },
    {
      actionType: "AUTHORIZATION" as const,
      expectedFailureResponse: TransactionInitializeSessionUseCaseResponses.Failure,
      expectedResultType: AuthorizationFailureResult,
    },
  ])(
    "Returns $expectedFailureResponse.name response with $expectedResultType.name result if AdyenPaymentIntentsAPI throws error and actionType is $actionType",
    async ({ actionType, expectedFailureResponse, expectedResultType }) => {
      vi.spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent").mockImplementationOnce(
        async () => err(new AdyenAPIError("Error from Adyen API")),
      );

      const uc = new TransactionInitializeSessionUseCase({
        appConfigRepo: mockedAppConfigRepo,
        adyenPaymentIntentsApiFactory,
        transactionRecorder: new MockedTransactionRecorder(),
      });

      const saleorEvent = getMockedTransactionInitializeSessionEvent({ actionType });

      const responsePayload = await uc.execute({
        saleorApiUrl: mockedSaleorApiUrl,
        appId: mockedSaleorAppId,
        event: saleorEvent,
        saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
        problemReporter: mockAdyenProblemReporter,
      });

      expect(responsePayload._unsafeUnwrap()).toBeInstanceOf(expectedFailureResponse);
      expect(responsePayload._unsafeUnwrap().transactionResult).toBeInstanceOf(expectedResultType);
    },
  );

  it.each([
    {
      actionType: "CHARGE" as const,
      expectedFailureResponse: TransactionInitializeSessionUseCaseResponses.Failure,
      expectedResultType: ChargeFailureResult,
    },
    {
      actionType: "AUTHORIZATION" as const,
      expectedFailureResponse: TransactionInitializeSessionUseCaseResponses.Failure,
      expectedResultType: AuthorizationFailureResult,
    },
  ])(
    "Returns $expectedFailureResponse.name response with $expectedResultType.name result when receives not supported payment method in data and actionType is $actionType",
    async ({ actionType, expectedFailureResponse, expectedResultType }) => {
      const eventWithNotSupportedPaymentMethod = {
        ...getMockedTransactionInitializeSessionEvent({ actionType }),
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

      const responsePayload = await uc.execute({
        saleorApiUrl: mockedSaleorApiUrl,
        appId: mockedSaleorAppId,
        event: eventWithNotSupportedPaymentMethod,
        saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
        problemReporter: mockAdyenProblemReporter,
      });

      const failure = responsePayload._unsafeUnwrap() as InstanceType<
        typeof TransactionInitializeSessionUseCaseResponses.Failure
      >;

      expect(failure).toBeInstanceOf(expectedFailureResponse);
      expect(failure.transactionResult).toBeInstanceOf(expectedResultType);
      expect(failure.error.publicMessage).toBe(
        'Payment method "not-supported-payment-method" is not supported. Contact Saleor for assistance.',
      );
    },
  );

  it.each([
    {
      actionType: "CHARGE" as const,
      expectedFailureResponse: TransactionInitializeSessionUseCaseResponses.Failure,
      expectedResultType: ChargeFailureResult,
    },
    {
      actionType: "AUTHORIZATION" as const,
      expectedFailureResponse: TransactionInitializeSessionUseCaseResponses.Failure,
      expectedResultType: AuthorizationFailureResult,
    },
  ])(
    "Returns $expectedFailureResponse.name response with $expectedResultType.name result when receives additional field in data and actionType is $actionType",
    async ({ actionType, expectedFailureResponse, expectedResultType }) => {
      const eventWithAdditionalFieldinData = {
        ...getMockedTransactionInitializeSessionEvent({ actionType }),
        data: {
          paymentIntent: {
            paymentMethod: "card",
            addtionalField: "value",
          },
        },
      };

      const uc = new TransactionInitializeSessionUseCase({
        appConfigRepo: mockedAppConfigRepo,
        adyenPaymentIntentsApiFactory,
        transactionRecorder: new MockedTransactionRecorder(),
      });

      const responsePayload = await uc.execute({
        saleorApiUrl: mockedSaleorApiUrl,
        appId: mockedSaleorAppId,
        event: eventWithAdditionalFieldinData,
        saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
        problemReporter: mockAdyenProblemReporter,
      });

      expect(responsePayload._unsafeUnwrap()).toBeInstanceOf(expectedFailureResponse);
      expect(responsePayload._unsafeUnwrap().transactionResult).toBeInstanceOf(expectedResultType);
    },
  );

  it("Returns 'MalformedRequestResponse' when currency coming from Saleor is not supported", async () => {
    const saleorEvent = {
      ...getMockedTransactionInitializeSessionEvent(),
      action: {
        amount: 100,
        currency: "ABC",
        actionType: "CHARGE" as const,
      },
    };

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: saleorEvent,
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(MalformedRequestResponse);
  });

  it("Returns 'BrokenAppResponse' when currency coming from Adyen is not supported", async () => {
    const saleorEvent = getMockedTransactionInitializeSessionEvent();

    vi.spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent").mockImplementationOnce(
      async () =>
        ok({
          amount: 100,
          currency: "abc",
          status: "requires_payment_method",
        } as Adyen.PaymentIntent),
    );

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: saleorEvent,
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(BrokenAppResponse);
  });

  it("Returns 'BrokenAppResponse' when Adyen PaymentIntentsAPI didn't returned required client_secret field", async () => {
    const saleorEvent = getMockedTransactionInitializeSessionEvent();

    vi.spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent").mockImplementationOnce(
      async () =>
        ok({
          amount: 100,
          currency: "usd",
          id: "pi_test",
          status: "requires_payment_method",
        } as Adyen.PaymentIntent),
    );

    vi.spyOn(mockedAdyenPaymentIntentsApi, "cancelPaymentIntent").mockImplementationOnce(
      async () => ok({} as Adyen.PaymentIntent),
    );

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: saleorEvent,
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(BrokenAppResponse);
  });

  it("Returns 'BrokenAppResponse' when Adyen PaymentIntentsAPI didn't returned required payment id", async () => {
    const saleorEvent = getMockedTransactionInitializeSessionEvent();

    vi.spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent").mockImplementationOnce(
      async () =>
        ok({
          amount: 100,
          currency: "usd",
          client_secret: "secret-value",
          status: "requires_payment_method",
        } as Adyen.PaymentIntent),
    );

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: saleorEvent,
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(BrokenAppResponse);
  });

  it("Returns 'BrokenAppResponse' when TransactionRecorderRepo returns error", async () => {
    const saleorEvent = getMockedTransactionInitializeSessionEvent();
    const transactionRecorder = new MockedTransactionRecorder();

    vi.spyOn(transactionRecorder, "recordTransaction").mockImplementationOnce(async () =>
      err(new TransactionRecorderError.TransactionMissingError("Transaction recorder error")),
    );

    vi.spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent").mockImplementationOnce(
      async () =>
        ok({
          amount: 100,
          currency: "usd",
          client_secret: "secret-value",
          status: "requires_payment_method",
        } as Adyen.PaymentIntent),
    );

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder,
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: saleorEvent,
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(BrokenAppResponse);
  });

  it("Cancels Payment Intent when mapping Adyen response fails", async () => {
    const saleorEvent = getMockedTransactionInitializeSessionEvent();

    vi.spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent").mockImplementationOnce(
      async () =>
        ok({
          amount: 100,
          currency: "abc",
          id: "pi_orphaned",
          status: "requires_payment_method",
        } as Adyen.PaymentIntent),
    );

    const cancelSpy = vi
      .spyOn(mockedAdyenPaymentIntentsApi, "cancelPaymentIntent")
      .mockImplementationOnce(async () => ok({} as Adyen.PaymentIntent));

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder: new MockedTransactionRecorder(),
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: saleorEvent,
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(BrokenAppResponse);
    expect(cancelSpy).toHaveBeenCalledWith({ id: "pi_orphaned" });
  });

  it("Cancels Payment Intent when DynamoDB write fails", async () => {
    const saleorEvent = getMockedTransactionInitializeSessionEvent();
    const transactionRecorder = new MockedTransactionRecorder();

    vi.spyOn(transactionRecorder, "recordTransaction").mockImplementationOnce(async () =>
      err(new TransactionRecorderError.TransactionMissingError("Transaction recorder error")),
    );

    vi.spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent").mockImplementationOnce(
      async () =>
        ok({
          amount: 100,
          currency: "usd",
          client_secret: "secret-value",
          id: "pi_orphaned",
          status: "requires_payment_method",
        } as Adyen.PaymentIntent),
    );

    const cancelSpy = vi
      .spyOn(mockedAdyenPaymentIntentsApi, "cancelPaymentIntent")
      .mockImplementationOnce(async () => ok({} as Adyen.PaymentIntent));

    const uc = new TransactionInitializeSessionUseCase({
      appConfigRepo: mockedAppConfigRepo,
      adyenPaymentIntentsApiFactory,
      transactionRecorder,
    });

    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
      event: saleorEvent,
      saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      problemReporter: mockAdyenProblemReporter,
    });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(BrokenAppResponse);
    expect(cancelSpy).toHaveBeenCalledWith({ id: "pi_orphaned" });
  });

  it.each([
    {
      actionType: "CHARGE" as const,
    },
    {
      actionType: "AUTHORIZATION" as const,
    },
  ])(
    "Calls TransactionRecorderRepo with resolved data when handling $actionType action",
    async ({ actionType }) => {
      const saleorEvent = getMockedTransactionInitializeSessionEvent({ actionType });
      const transactionRecorder = new MockedTransactionRecorder();

      vi.spyOn(transactionRecorder, "recordTransaction");

      vi.spyOn(mockedAdyenPaymentIntentsApi, "createPaymentIntent").mockImplementation(async () =>
        ok({
          amount: 100,
          currency: "usd",
          client_secret: "secret-value",
          id: "pi_test",
          status: "requires_payment_method",
        } as Adyen.PaymentIntent),
      );

      const uc = new TransactionInitializeSessionUseCase({
        appConfigRepo: mockedAppConfigRepo,
        adyenPaymentIntentsApiFactory,
        transactionRecorder,
      });

      await uc.execute({
        saleorApiUrl: mockedSaleorApiUrl,
        appId: mockedSaleorAppId,
        event: saleorEvent,
        saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
        problemReporter: mockAdyenProblemReporter,
      });

      expect(transactionRecorder.recordTransaction).toHaveBeenCalledWith(
        {
          saleorApiUrl: mockedSaleorApiUrl,
          appId: mockedSaleorAppId,
        },
        {
          resolvedTransactionFlow: actionType,
          saleorTransactionFlow: actionType,
          saleorTransactionId: "mocked-transaction-id",
          selectedPaymentMethod: "card",
          adyenPaymentIntentId: "pi_test",
          saleorSchemaVersion: [3, 22],
        },
      );
    },
  );
});
