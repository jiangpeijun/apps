import type Adyen from "adyen";
import { describe, expect, it } from "vitest";

import { getMockedRecordedTransaction } from "@/__tests__/mocks/mocked-recorded-transaction";
import { mockedAdyenPaymentIntentId } from "@/__tests__/mocks/mocked-adyen-payment-intent-id";
import { mockedAdyenRefundId } from "@/__tests__/mocks/mocked-adyen-refund-id";
import { MockedTransactionRecorder } from "@/__tests__/mocks/mocked-transaction-recorder";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { getMockedChargeRefundUpdatedEvent } from "@/__tests__/mocks/adyen-events/mocked-charge-refund-updated";
import { createResolvedTransactionFlow } from "@/modules/resolved-transaction-flow";

import { AdyenRefundHandler } from "./adyen-refund-handler";

describe("AdyenRefundHandler", () => {
  describe("processRefundEvent", () => {
    it("should return NotSupportedEventError for unsupported event", async () => {
      const mockTransactionRecorder = new MockedTransactionRecorder();
      const event = {
        type: "refund.created",
      } as unknown as Adyen.Event;

      const handler = new AdyenRefundHandler();

      const result = await handler.processRefundEvent({
        event,
        adyenEnv: "LIVE",
        transactionRecorder: mockTransactionRecorder,
        appId: "appId",
        saleorApiUrl: mockedSaleorApiUrl,
      });

      expect(result._unsafeUnwrapErr()).toBeInstanceOf(AdyenRefundHandler.NotSupportedEventError);
    });

    describe("charge.refund.updated", () => {
      it.each([
        createResolvedTransactionFlow("AUTHORIZATION"),
        createResolvedTransactionFlow("CHARGE"),
      ])(
        "should resolve fields from Adyen event properly for '%s' flow",
        async (resolvedTransactionFlow) => {
          const event = getMockedChargeRefundUpdatedEvent();
          const mockTransactionRecorder = new MockedTransactionRecorder();

          mockTransactionRecorder.transactions = {
            [mockedAdyenPaymentIntentId]: getMockedRecordedTransaction({
              resolvedTransactionFlow,
            }),
          };

          const amountToUse = 123_30;
          const amountExpected = 123.3; // Converted to Saleor float

          event.data.object.amount = amountToUse;

          const handler = new AdyenRefundHandler();

          const result = await handler.processRefundEvent({
            event,
            transactionRecorder: mockTransactionRecorder,
            appId: "appId",
            saleorApiUrl: mockedSaleorApiUrl,
            adyenEnv: "LIVE",
          });

          const { type, amount, pspReference, time } = result
            ._unsafeUnwrap()
            .resolveEventReportVariables();

          expect(type).toBe("REFUND_SUCCESS");
          // comes from mock
          expect(amount.currency).toStrictEqual("USD");
          expect(amount.amount).toStrictEqual(amountExpected);
          expect(pspReference).toStrictEqual(event.data.object.id);
          expect(time).toStrictEqual("2025-02-01T00:00:00.000Z");
        },
      );

      it("should return MalformedEventError if event does not contain payment_intent", async () => {
        const event = {
          ...getMockedChargeRefundUpdatedEvent(),
          data: {
            object: {
              payment_intent: null,
            },
          },
        } as unknown as Adyen.ChargeRefundUpdatedEvent;

        const mockTransactionRecorder = new MockedTransactionRecorder();

        mockTransactionRecorder.transactions = {
          [mockedAdyenPaymentIntentId]: getMockedRecordedTransaction(),
        };

        const handler = new AdyenRefundHandler();

        const result = await handler.processRefundEvent({
          event,
          transactionRecorder: mockTransactionRecorder,
          appId: "appId",
          saleorApiUrl: mockedSaleorApiUrl,
          adyenEnv: "LIVE",
        });

        expect(result._unsafeUnwrapErr()).toBeInstanceOf(AdyenRefundHandler.MalformedEventError);
      });

      it("should resolve payment_intent from object", async () => {
        const event = {
          ...getMockedChargeRefundUpdatedEvent(),
          data: {
            object: {
              ...getMockedChargeRefundUpdatedEvent().data.object,
              payment_intent: {
                id: mockedAdyenPaymentIntentId.toString(),
              },
            },
          },
        } as unknown as Adyen.ChargeRefundUpdatedEvent;

        const mockTransactionRecorder = new MockedTransactionRecorder();

        mockTransactionRecorder.transactions = {
          [mockedAdyenPaymentIntentId]: getMockedRecordedTransaction(),
        };

        const handler = new AdyenRefundHandler();

        const result = await handler.processRefundEvent({
          event,
          transactionRecorder: mockTransactionRecorder,
          appId: "appId",
          saleorApiUrl: mockedSaleorApiUrl,
          adyenEnv: "LIVE",
        });

        const { pspReference } = result._unsafeUnwrap().resolveEventReportVariables();

        expect(pspReference).toStrictEqual(mockedAdyenRefundId);
      });
    });
  });
});
