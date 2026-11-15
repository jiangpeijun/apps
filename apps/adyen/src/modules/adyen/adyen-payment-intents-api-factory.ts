// apps\adyen\src\modules\adyen\adyen-payment-intents-api-factory.ts
import { AdyenPaymentIntentsApi } from "./adyen-payment-intents-api";
import { type AdyenRestrictedKey } from "./adyen-restricted-key";
import { type IAdyenPaymentIntentsApi, type IAdyenPaymentIntentsApiFactory } from "./types";

export class AdyenPaymentIntentsApiFactory implements IAdyenPaymentIntentsApiFactory {
  create(args: { key: AdyenRestrictedKey }): IAdyenPaymentIntentsApi {
    return AdyenPaymentIntentsApi.createFromKey({ key: args.key });
  }
}
