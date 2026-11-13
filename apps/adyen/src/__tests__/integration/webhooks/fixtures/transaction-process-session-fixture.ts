import { mockedSaleorAppId, mockedSaleorChannelId } from "@/__tests__/mocks/constants";
import { type TransactionProcessSessionEventFragment } from "@/generated/graphql";
import { type SaleorTransationFlow } from "@/modules/saleor/saleor-transaction-flow";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";

export const transactionProcessSessionFixture = (
  adyenPaymentIntentId: AdyenPaymentIntentId,
  transactionFlow: SaleorTransationFlow,
): TransactionProcessSessionEventFragment => {
  return {
    sourceObject: {
      __typename: "Checkout",
      channel: {
        slug: "default-channel",
        id: mockedSaleorChannelId,
      },
      id: "checkout-id",
    },
    recipient: {
      id: mockedSaleorAppId,
    },
    action: {
      actionType: transactionFlow,
      amount: 123.3,
    },
    transaction: {
      pspReference: adyenPaymentIntentId,
    },
  };
};
