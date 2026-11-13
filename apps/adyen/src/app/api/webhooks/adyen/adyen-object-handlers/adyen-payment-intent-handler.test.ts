import { ok } from "neverthrow";
import type Adyen from "adyen";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMockedRecordedTransaction } from "@/__tests__/mocks/mocked-recorded-transaction";
import { mockedAdyenPaymentIntentId } from "@/__tests__/mocks/mocked-adyen-payment-intent-id";
import { mockedAdyenPaymentIntentsApi } from "@/__tests__/mocks/mocked-adyen-payment-intents-api";
import {
  mockedAdyenCardPaymentMethod,
  mockedAdyenOtherPaymentMethod,
} from "@/__tests__/mocks/mocked-adyen-payment-method";
import { MockedTransactionRecorder } from "@/__tests__/mocks/mocked-transaction-recorder";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { getMockedPaymentIntentAmountCapturableUpdatedEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-amount-capturable-updated";
import { getMockedPaymentIntentPaymentCanceledEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-canceled";
import { getMockedPaymentIntentPaymentFailedEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-failed";
import { getMockedPaymentIntentProcessingEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-processing";
import { getMockedPaymentIntentRequiresActionEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-requires-action";
import { getMockedPaymentIntentSucceededEvent } from "@/__tests__/mocks/adyen-events/mocked-payment-intent-succeeded";
import { createResolvedTransactionFlow } from "@/modules/resolved-transaction-flow";

import { AdyenPaymentIntentHandler } from "./adyen-payment-intent-handler";

describe("AdyenPaymentIntentHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return NotSupportedEventError for unsupported event", async () => {
    const mockTransactionRecorder = new MockedTransactionRecorder();
    const event = {
      type: "payment_intent.created",
    } as unknown as Adyen.Event;

    const handler = new AdyenPaymentIntentHandler();

    const result = await handler.processPaymentIntentEvent({
      event,
      adyenEnv: "LIVE",
      transactionRecorder: mockTransactionRecorder,
      appId: "appId",
      saleorApiUrl: mockedSaleorApiUrl,
      adyenPaymentIntentsApi: mockedAdyenPaymentIntentsApi,
    });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(
      AdyenPaymentIntentHandler.NotSupportedEventError,
    );
  });

  describe("processPaymentIntentEvent", () => {
    describe("type: payment_intent.succeeded", () => {
      it.each([
        createResolvedTransactionFlow("AUTHORIZATION"),
        createResolvedTransactionFlow("CHARGE"),
      ])(
        "should resolve fields with type: 'CHARGE' from Adyen event properly for '%s' flow",
        async (resolvedTransactionFlow) => {
          const mockTransactionRecorder = new MockedTransactionRecorder();

          mockTransactionRecorder.transactions = {
            [mockedAdyenPaymentIntentId]: getMockedRecordedTransaction({
              resolvedTransactionFlow,
            }),
          };

          vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(
            async () =>
              ok({
                payment_method: mockedAdyenCardPaymentMethod,
              }),
          );

          const event = getMockedPaymentIntentSucceededEvent();
          const amountToUse = 123_312;
          const amountExpected = 123.312; // Converted to Saleor float

          event.data.object.amount_received = amountToUse;

          const handler = new AdyenPaymentIntentHandler();
          const result = await handler.processPaymentIntentEvent({
            event,
            transactionRecorder: mockTransactionRecorder,
            appId: "appId",
            saleorApiUrl: mockedSaleorApiUrl,
            adyenEnv: "LIVE",
            adyenPaymentIntentsApi: mockedAdyenPaymentIntentsApi,
          });

          const { type, amount, pspReference, time, saleorPaymentMethodDetailsInput } = result
            ._unsafeUnwrap()
            .resolveEventReportVariables();

          expect(type).toBe("CHARGE_SUCCESS");
          // comes from mock
          expect(amount.currency).toStrictEqual("IQD");
          expect(amount.amount).toStrictEqual(amountExpected);
          expect(pspReference).toStrictEqual(event.data.object.id);
          expect(time).toStrictEqual("2025-02-01T00:00:00.000Z");
          expect(saleorPaymentMethodDetailsInput).toStrictEqual({
            card: {
              brand: "visa",
              expMonth: 12,
              expYear: 2025,
              lastDigits: "4242",
              name: "Visa",
            },
          });
        },
      );
    });

    describe("type: payment_intent.processing", () => {
      it.each([
        {
          resolvedTransactionFlow: createResolvedTransactionFlow("AUTHORIZATION"),
          expectedType: "AUTHORIZATION_REQUEST",
        },
        {
          resolvedTransactionFlow: createResolvedTransactionFlow("CHARGE"),
          expectedType: "CHARGE_REQUEST",
        },
      ])(
        "should resolve fields with type: $expectedType from Adyen event properly for $resolvedTransactionFlow flow",
        async ({ resolvedTransactionFlow, expectedType }) => {
          const event = getMockedPaymentIntentProcessingEvent();
          const mockTransactionRecorder = new MockedTransactionRecorder();

          mockTransactionRecorder.transactions = {
            [mockedAdyenPaymentIntentId]: getMockedRecordedTransaction({
              resolvedTransactionFlow,
            }),
          };

          vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(
            async () =>
              ok({
                payment_method: mockedAdyenOtherPaymentMethod,
              }),
          );

          const amountToUse = 123_30;
          const amountExpected = 12330; // Converted to Saleor float

          event.data.object.amount = amountToUse;

          const handler = new AdyenPaymentIntentHandler();
          const result = await handler.processPaymentIntentEvent({
            event,
            transactionRecorder: mockTransactionRecorder,
            appId: "appId",
            saleorApiUrl: mockedSaleorApiUrl,
            adyenEnv: "LIVE",
            adyenPaymentIntentsApi: mockedAdyenPaymentIntentsApi,
          });

          const { type, amount, pspReference, time, saleorPaymentMethodDetailsInput } = result
            ._unsafeUnwrap()
            .resolveEventReportVariables();

          expect(type).toBe(expectedType);
          // comes from mock
          expect(amount.currency).toStrictEqual("JPY");
          // Converted to Saleor float
          expect(amount.amount).toStrictEqual(amountExpected);
          expect(pspReference).toStrictEqual(event.data.object.id);
          expect(time).toStrictEqual("2025-02-01T00:00:00.000Z");
          expect(saleorPaymentMethodDetailsInput).toStrictEqual({
            other: {
              name: "sepa_debit",
            },
          });
        },
      );
    });

    describe("type: payment_intent.requires_action", () => {
      it.each([
        {
          resolvedTransactionFlow: createResolvedTransactionFlow("AUTHORIZATION"),
          expectedType: "AUTHORIZATION_ACTION_REQUIRED",
        },
        {
          resolvedTransactionFlow: createResolvedTransactionFlow("CHARGE"),
          expectedType: "CHARGE_ACTION_REQUIRED",
        },
      ])(
        "should resolve fields with type: $expectedType from Adyen event properly for $resolvedTransactionFlow flow",
        async ({ resolvedTransactionFlow, expectedType }) => {
          const mockTransactionRecorder = new MockedTransactionRecorder();

          mockTransactionRecorder.transactions = {
            [mockedAdyenPaymentIntentId]: getMockedRecordedTransaction({
              resolvedTransactionFlow,
            }),
          };

          vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(
            async () =>
              ok({
                payment_method: null,
              }),
          );

          const event = getMockedPaymentIntentRequiresActionEvent();
          const amountToUse = 123_367;
          const amountExpected = 12.3367; // Converted to Saleor float

          event.data.object.amount = amountToUse;

          const handler = new AdyenPaymentIntentHandler();

          const result = await handler.processPaymentIntentEvent({
            event,
            transactionRecorder: mockTransactionRecorder,
            appId: "appId",
            saleorApiUrl: mockedSaleorApiUrl,
            adyenEnv: "LIVE",
            adyenPaymentIntentsApi: mockedAdyenPaymentIntentsApi,
          });

          const { type, amount, pspReference, time, saleorPaymentMethodDetailsInput } = result
            ._unsafeUnwrap()
            .resolveEventReportVariables();

          expect(type).toBe(expectedType);
          // comes from mock
          expect(amount.currency).toStrictEqual("UYW");
          expect(amount.amount).toStrictEqual(amountExpected);
          expect(pspReference).toStrictEqual(event.data.object.id);
          expect(time).toStrictEqual("2025-02-01T00:00:00.000Z");
          expect(saleorPaymentMethodDetailsInput).toBeNull();
        },
      );
    });

    describe("type: payment_intent.amount_capturable_updated", () => {
      it.each([
        {
          resolvedTransactionFlow: createResolvedTransactionFlow("AUTHORIZATION"),
          expectedType: "AUTHORIZATION_SUCCESS",
        },
        {
          resolvedTransactionFlow: createResolvedTransactionFlow("CHARGE"),
          expectedType: "AUTHORIZATION_SUCCESS",
        },
      ])(
        "should resolve fields with type: $expectedType from Adyen event properly for $resolvedTransactionFlow flow",
        async ({ resolvedTransactionFlow, expectedType }) => {
          const mockTransactionRecorder = new MockedTransactionRecorder();

          mockTransactionRecorder.transactions = {
            [mockedAdyenPaymentIntentId]: getMockedRecordedTransaction({
              resolvedTransactionFlow,
            }),
          };

          vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(
            async () =>
              ok({
                payment_method: "pm_1MockedOtherPaymentMethod",
              }),
          );

          const event = getMockedPaymentIntentAmountCapturableUpdatedEvent();
          const amountToUse = 123_30;
          const amountExpected = 123.3; // Converted to Saleor float

          event.data.object.amount_capturable = amountToUse;

          const handler = new AdyenPaymentIntentHandler();
          const result = await handler.processPaymentIntentEvent({
            event,
            transactionRecorder: mockTransactionRecorder,
            appId: "appId",
            saleorApiUrl: mockedSaleorApiUrl,
            adyenEnv: "LIVE",
            adyenPaymentIntentsApi: mockedAdyenPaymentIntentsApi,
          });

          const { type, amount, pspReference, time, saleorPaymentMethodDetailsInput } = result
            ._unsafeUnwrap()
            .resolveEventReportVariables();

          expect(type).toBe(expectedType);
          // comes from mock
          expect(amount.currency).toStrictEqual("USD");
          expect(amount.amount).toStrictEqual(amountExpected);
          expect(pspReference).toStrictEqual(event.data.object.id);
          expect(time).toStrictEqual("2025-02-01T00:00:00.000Z");
          expect(saleorPaymentMethodDetailsInput).toBeNull();
        },
      );
    });

    describe("type: payment_intent.payment_failed", () => {
      it.each([
        {
          resolvedTransactionFlow: createResolvedTransactionFlow("AUTHORIZATION"),
          expectedType: "AUTHORIZATION_FAILURE",
        },
        {
          resolvedTransactionFlow: createResolvedTransactionFlow("CHARGE"),
          expectedType: "CHARGE_FAILURE",
        },
      ])(
        "should resolve fields with type: $expectedType from Adyen event properly for $resolvedTransactionFlow flow",
        async ({ resolvedTransactionFlow, expectedType }) => {
          const mockTransactionRecorder = new MockedTransactionRecorder();

          mockTransactionRecorder.transactions = {
            [mockedAdyenPaymentIntentId]: getMockedRecordedTransaction({
              resolvedTransactionFlow,
            }),
          };

          vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(
            async () =>
              ok({
                payment_method: mockedAdyenOtherPaymentMethod,
              }),
          );

          const event = getMockedPaymentIntentPaymentFailedEvent();
          const amountToUse = 123_30;
          const amountExpected = 123.3; // Converted to Saleor float

          event.data.object.amount = amountToUse;

          const handler = new AdyenPaymentIntentHandler();
          const result = await handler.processPaymentIntentEvent({
            event,
            transactionRecorder: mockTransactionRecorder,
            appId: "appId",
            saleorApiUrl: mockedSaleorApiUrl,
            adyenEnv: "LIVE",
            adyenPaymentIntentsApi: mockedAdyenPaymentIntentsApi,
          });

          const { type, amount, pspReference, time, saleorPaymentMethodDetailsInput } = result
            ._unsafeUnwrap()
            .resolveEventReportVariables();

          expect(type).toBe(expectedType);
          // comes from mock
          expect(amount.currency).toStrictEqual("USD");
          expect(amount.amount).toStrictEqual(amountExpected);
          expect(pspReference).toStrictEqual(event.data.object.id);
          expect(time).toStrictEqual("2025-02-01T00:00:00.000Z");
          expect(saleorPaymentMethodDetailsInput).toStrictEqual({
            other: {
              name: "sepa_debit",
            },
          });
        },
      );
    });

    describe("type: payment_intent.canceled", () => {
      it.each([
        {
          resolvedTransactionFlow: createResolvedTransactionFlow("AUTHORIZATION"),
          expectedType: "CANCEL_SUCCESS",
        },
        {
          resolvedTransactionFlow: createResolvedTransactionFlow("CHARGE"),
          expectedType: "CANCEL_SUCCESS",
        },
      ])(
        "should resolve fields with type: $expectedType from Adyen event properly for $resolvedTransactionFlow flow",
        async ({ resolvedTransactionFlow, expectedType }) => {
          const event = getMockedPaymentIntentPaymentCanceledEvent();
          const mockTransactionRecorder = new MockedTransactionRecorder();

          mockTransactionRecorder.transactions = {
            [mockedAdyenPaymentIntentId]: getMockedRecordedTransaction({
              resolvedTransactionFlow,
            }),
          };

          vi.spyOn(mockedAdyenPaymentIntentsApi, "getPaymentIntent").mockImplementationOnce(
            async () =>
              ok({
                payment_method: mockedAdyenCardPaymentMethod,
              }),
          );

          const amountToUse = 123_30;
          const amountExpected = 123.3; // Converted to Saleor float

          event.data.object.amount = amountToUse;

          const handler = new AdyenPaymentIntentHandler();
          const result = await handler.processPaymentIntentEvent({
            event,
            transactionRecorder: mockTransactionRecorder,
            appId: "appId",
            saleorApiUrl: mockedSaleorApiUrl,
            adyenEnv: "LIVE",
            adyenPaymentIntentsApi: mockedAdyenPaymentIntentsApi,
          });

          const { type, amount, pspReference, time, saleorPaymentMethodDetailsInput } = result
            ._unsafeUnwrap()
            .resolveEventReportVariables();

          expect(type).toBe(expectedType);
          // comes from mock
          expect(amount.currency).toStrictEqual("USD");
          expect(amount.amount).toStrictEqual(amountExpected);
          expect(pspReference).toStrictEqual(event.data.object.id);
          expect(time).toStrictEqual("2025-02-01T00:00:00.000Z");
          expect(saleorPaymentMethodDetailsInput).toStrictEqual({
            card: {
              brand: "visa",
              expMonth: 12,
              expYear: 2025,
              lastDigits: "4242",
              name: "Visa",
            },
          });
        },
      );
    });
  });
});
