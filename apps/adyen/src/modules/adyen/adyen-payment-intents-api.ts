import { type Result, ResultAsync } from "neverthrow";
import type Adyen from "adyen";

import { AdyenClient } from "@/modules/adyen/adyen-client";

import { type AdyenPaymentIntentId } from "./adyen-payment-intent-id";
import { type AdyenRestrictedKey } from "./adyen-restricted-key";
import {
  type AllowedAdyenObjectMetadata,
  type CreatePaymentIntentArgs,
  type IAdyenPaymentIntentsApi,
} from "./types";

export class AdyenPaymentIntentsApi implements IAdyenPaymentIntentsApi {
  private adyenApiWrapper: Pick<Adyen, "paymentIntents">;

  private constructor(adyenApiWrapper: Pick<Adyen, "paymentIntents">) {
    this.adyenApiWrapper = adyenApiWrapper;
  }

  static createFromKey(args: { key: AdyenRestrictedKey }) {
    const adyenApiWrapper = AdyenClient.createFromRestrictedKey(args.key);

    return new AdyenPaymentIntentsApi(adyenApiWrapper.nativeClient);
  }

  static createFromClient(client: AdyenClient) {
    return new AdyenPaymentIntentsApi(client.nativeClient);
  }

  async createPaymentIntent(
    args: CreatePaymentIntentArgs,
  ): Promise<Result<Adyen.PaymentIntent, unknown>> {
    return ResultAsync.fromPromise(
      this.adyenApiWrapper.paymentIntents.create(
        {
          ...args.intentParams,
          amount: args.adyenMoney.amount,
          currency: args.adyenMoney.currency,
          ...(args.metadata && { metadata: args.metadata }),
        },
        {
          idempotencyKey: args.idempotencyKey,
        },
      ),
      (error) => error,
    );
  }

  async getPaymentIntent(args: {
    id: AdyenPaymentIntentId;
  }): Promise<Result<Adyen.PaymentIntent, unknown>> {
    return ResultAsync.fromPromise(
      this.adyenApiWrapper.paymentIntents.retrieve(args.id, {
        expand: ["payment_method"],
      }),
      (error) => error,
    );
  }

  async capturePaymentIntent(args: {
    id: AdyenPaymentIntentId;
    idempotencyKey: string | undefined;
    metadata?: AllowedAdyenObjectMetadata;
  }): Promise<Result<Adyen.PaymentIntent, unknown>> {
    return ResultAsync.fromPromise(
      this.adyenApiWrapper.paymentIntents.capture(
        args.id,
        args.metadata && { metadata: args.metadata },
        {
          idempotencyKey: args.idempotencyKey,
        },
      ),
      (error) => error,
    );
  }

  async cancelPaymentIntent(args: {
    id: AdyenPaymentIntentId;
    idempotencyKey: string | undefined;
  }): Promise<Result<Adyen.PaymentIntent, unknown>> {
    return ResultAsync.fromPromise(
      this.adyenApiWrapper.paymentIntents.cancel(args.id, undefined, {
        idempotencyKey: args.idempotencyKey,
      }),
      (error) => error,
    );
  }
}
