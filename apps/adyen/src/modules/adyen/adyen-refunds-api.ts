import { type Result, ResultAsync } from "neverthrow";
import type Adyen from "adyen";

import { AdyenClient } from "./adyen-client";
import { type AdyenMoney } from "./adyen-money";
import { type AdyenPaymentIntentId } from "./adyen-payment-intent-id";
import { type AdyenRestrictedKey } from "./adyen-restricted-key";
import { type IAdyenRefundsApi } from "./types";

export class AdyenRefundsApi implements IAdyenRefundsApi {
  private adyenApiWrapper: Pick<Adyen, "refunds">;

  private constructor(adyenApiWrapper: Pick<Adyen, "refunds">) {
    this.adyenApiWrapper = adyenApiWrapper;
  }

  static createFromKey(args: { key: AdyenRestrictedKey }) {
    const adyenApiWrapper = AdyenClient.createFromRestrictedKey(args.key);

    return new AdyenRefundsApi(adyenApiWrapper.nativeClient);
  }

  async createRefund(args: {
    paymentIntentId: AdyenPaymentIntentId;
    adyenMoney: AdyenMoney;
    idempotencyKey: string | undefined;
    metadata?: Adyen.MetadataParam;
  }): Promise<Result<Adyen.Refund, unknown>> {
    return ResultAsync.fromPromise(
      this.adyenApiWrapper.refunds.create(
        {
          payment_intent: args.paymentIntentId,
          amount: args.adyenMoney.amount,
          metadata: args.metadata,
        },
        {
          idempotencyKey: args.idempotencyKey,
        },
      ),
      (error) => error,
    );
  }
}
