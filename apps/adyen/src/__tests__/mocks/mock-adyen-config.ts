// apps/adyen/src/__tests__/mocks/mock-adyen-config.ts
import { mockedConfigurationId } from "@/__tests__/mocks/constants";
import { type AdyenConfig } from "@/modules/app-config/domain/adyen-config";

export const mockedAdyenConfig: AdyenConfig = {
  id: mockedConfigurationId,
  name: "config-name",
  merchantAccount: "merchant-account",
  apiKeyEncrypted: "api-key",
  hmacKeyEncrypted: "hmac-key",
  clientKey: "test_client_key",
  environment: "test",
  storefrontUrl: "http://localhost:3001",
  channelSlugs: [],
  saleorApiUrl: "http://localhost:8000/graphql/",
  token: "token",
};