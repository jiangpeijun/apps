import {
  mockedSaleorAppId,
  mockedSaleorChannelId,
  mockedSaleorTransactionId,
} from "@/__tests__/mocks/constants";
import { type TransactionCancelationRequestedEventFragment } from "@/generated/graphql";
import { RandomId } from "@/lib/random-id";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";

export const transactionCancelationRequestedFixture = (
  adyenPaymentIntentId: AdyenPaymentIntentId,
): TransactionCancelationRequestedEventFragment => {
  return {
    idempotencyKey: new RandomId().generate(),
    transaction: {
      id: mockedSaleorTransactionId,
      pspReference: adyenPaymentIntentId,
      checkout: {
        id: "checkout-id",
        channel: {
          slug: "default-channel",
          id: mockedSaleorChannelId,
        },
      },
    },
    recipient: {
      id: mockedSaleorAppId,
    },
  };
};
