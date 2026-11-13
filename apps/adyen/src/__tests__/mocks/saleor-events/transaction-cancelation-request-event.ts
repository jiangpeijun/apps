import { type TransactionCancelationRequestedEventFragment } from "@/generated/graphql";

import {
  mockedSaleorActionIdempotencyKey,
  mockedSaleorChannelId,
  mockedSaleorTransactionId,
} from "../constants";
import { mockedAdyenPaymentIntentId } from "../mocked-adyen-payment-intent-id";

export const getMockedTransactionCancelationRequestedEvent =
  (): TransactionCancelationRequestedEventFragment => ({
    idempotencyKey: mockedSaleorActionIdempotencyKey,
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
