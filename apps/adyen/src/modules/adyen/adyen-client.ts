import Adyen from "adyen";

import { env } from "@/lib/env";
import { type AdyenRestrictedKey } from "@/modules/adyen/adyen-restricted-key";
import pkg from "@/package.json";

import { ADYEN_API_VERSION } from "./adyen-api-version";

/**
 * Holds native client,
 * provides a single initialization place for Adyen SDK
 */
export class AdyenClient {
  readonly nativeClient: Adyen;

  constructor(nativeClient: Adyen) {
    this.nativeClient = nativeClient;
  }

  static createFromRestrictedKey(key: AdyenRestrictedKey) {
    const nativeClient = new Adyen(key, {
      typescript: true,
      httpClient: Adyen.createFetchHttpClient(fetch), // this allow us to mock the fetch
      apiVersion: ADYEN_API_VERSION,
      appInfo: {
        name: "Saleor App Adyen",
        version: pkg.version,
        url: env.APPSTORE_URL,
        partner_id: env.ADYEN_PARTNER_ID,
      },
    });

    return new AdyenClient(nativeClient);
  }
}
