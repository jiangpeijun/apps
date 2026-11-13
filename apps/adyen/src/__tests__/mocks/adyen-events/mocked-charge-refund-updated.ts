import type Adyen from "adyen";

import { mockedSaleorTransactionId } from "@/__tests__/mocks/constants";
import { mockedAdyenPaymentIntentId } from "@/__tests__/mocks/mocked-adyen-payment-intent-id";

import { mockedAdyenRefundId } from "../mocked-adyen-refund-id";

type Options = {
  status?: Adyen.Refund["status"];
};

export const getMockedChargeRefundUpdatedEvent = (
  opts?: Options,
): Adyen.ChargeRefundUpdatedEvent => {
  // Adyen returns timestamp in seconds
  const date = new Date(2025, 1, 1).getTime() / 1000;

  return {
    account: "",
    api_version: "",
    request: { id: null, idempotency_key: null },
    object: "event",
    livemode: false,
    pending_webhooks: 0,
    id: "evt_event-id",
    created: date,
    type: "charge.refund.updated",
    data: {
      object: {
        currency: "usd",
        object: "refund",
        amount: 1000,
        id: mockedAdyenRefundId,
        created: date,
        metadata: {
          saleor_transaction_id: mockedSaleorTransactionId,
          saleor_source_id: "checkout-id-123",
          saleor_source_type: "Checkout",
        },
        presentment_details: { presentment_amount: 0, presentment_currency: "usd" },
        status: opts?.status ?? "succeeded",
        balance_transaction: null,
        charge: "ch_charge-id",
        payment_intent: mockedAdyenPaymentIntentId,
        reason: null,
        receipt_number: null,
        source_transfer_reversal: null,
        transfer_reversal: null,
      },
    },
  };
};
