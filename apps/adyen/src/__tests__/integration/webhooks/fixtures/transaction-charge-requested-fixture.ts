import {
  mockedSaleorAppId,
  mockedSaleorChannelId,
  mockedSaleorTransactionId,
} from "@/__tests__/mocks/constants";
import { type TransactionChargeRequestedEventFragment } from "@/generated/graphql";
import { RandomId } from "@/lib/random-id";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";

export const transactionChargeRequestedFixture = (args: {
  adyenPaymentIntentId: AdyenPaymentIntentId;
  amount: number;
}): TransactionChargeRequestedEventFragment => {
  return {
    idempotencyKey: new RandomId().generate(),
    action: {
      amount: args.amount,
    },
    transaction: {
      id: mockedSaleorTransactionId,
      pspReference: args.adyenPaymentIntentId,
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
