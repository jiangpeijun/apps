import { AdyenRefundsApi } from "./adyen-refunds-api";
import { type AdyenRestrictedKey } from "./adyen-restricted-key";
import { type IAdyenRefundsApi, type IAdyenRefundsApiFactory } from "./types";

export class AdyenRefundsApiFactory implements IAdyenRefundsApiFactory {
  create(args: { key: AdyenRestrictedKey }): IAdyenRefundsApi {
    return AdyenRefundsApi.createFromKey({ key: args.key });
  }
}
