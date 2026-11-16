// apps/adyen/src/modules/app-config/domain/adyen-config.ts

export interface AdyenConfig {
  id: string;
  name: string;
  merchantAccount: string;
  apiKeyEncrypted: string;
  hmacKeyEncrypted: string;
  clientKey: string;
  environment: "test" | "live";
  storefrontUrl: string;
  channelSlugs: string[];
  saleorApiUrl: string;
  token: string;
}

export type AdyenFrontendConfig = Pick<
  AdyenConfig, 
  "id" | "name" | "environment" | "clientKey" | "channelSlugs"
>;