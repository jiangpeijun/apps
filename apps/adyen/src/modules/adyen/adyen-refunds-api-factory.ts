import { StripeRefundsApi } from "./adyen-refunds-api";
import { type StripeRestrictedKey } from "./adyen-restricted-key";
import { type IStripeRefundsApi, type IStripeRefundsApiFactory } from "./types";

export class StripeRefundsApiFactory implements IStripeRefundsApiFactory {
  create(args: { key: StripeRestrictedKey }): IStripeRefundsApi {
    return StripeRefundsApi.createFromKey({ key: args.key });
  }
}
