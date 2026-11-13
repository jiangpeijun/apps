import { type TransactionRefundRequestedEventFragment } from "@/generated/graphql";

import {
  mockedSaleorActionIdempotencyKey,
  mockedSaleorChannelId,
  mockedSaleorTransactionId,
} from "../constants";
import { mockedAdyenPaymentIntentId } from "../mocked-adyen-payment-intent-id";

export const getMockedTransactionRefundRequestedEvent =
  (): TransactionRefundRequestedEventFragment => ({
    idempotencyKey: mockedSaleorActionIdempotencyKey,
    action: {
      amount: 100,
      currency: "USD",
    },
    transaction: {
      id: mockedSaleorTransactionId,
      pspReference: mockedAdyenPaymentIntentId,
      checkout: {
        id: "mock-channel-1",
        channel: {
          id: mockedSaleorChannelId,
          slug: "channel-slug",
        },
      },
    },
  });
