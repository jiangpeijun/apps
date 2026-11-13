import {
  mockedSaleorAppId,
  mockedSaleorChannelId,
  mockedSaleorTransactionId,
} from "@/__tests__/mocks/constants";
import { type TransactionRefundRequestedEventFragment } from "@/generated/graphql";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";

export const transactionRefundRequestedFixture = (args: {
  adyenPaymentIntentId: AdyenPaymentIntentId;
  idempotencyKey: string;
  amount?: number;
}): TransactionRefundRequestedEventFragment => {
  return {
    idempotencyKey: args.idempotencyKey,
    recipient: {
      id: mockedSaleorAppId,
    },
    action: {
      amount: args.amount ?? 123.3,
      currency: "USD",
    },
    transaction: {
      id: mockedSaleorTransactionId,
      pspReference: args.adyenPaymentIntentId,
      checkout: {
        channel: {
          slug: "default-channel",
          id: mockedSaleorChannelId,
        },
        id: "checkout-id",
      },
    },
  };
};
