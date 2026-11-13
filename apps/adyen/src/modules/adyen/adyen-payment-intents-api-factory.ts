import { StripePaymentIntentsApi } from "./adyen-payment-intents-api";
import { type StripeRestrictedKey } from "./adyen-restricted-key";
import { type IStripePaymentIntentsApi, type IStripePaymentIntentsApiFactory } from "./types";

export class StripePaymentIntentsApiFactory implements IStripePaymentIntentsApiFactory {
  create(args: { key: StripeRestrictedKey }): IStripePaymentIntentsApi {
    return StripePaymentIntentsApi.createFromKey({ key: args.key });
  }
}
