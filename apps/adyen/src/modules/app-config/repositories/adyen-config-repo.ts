import { AdyenConfig } from "../domain/adyen-config";

export async function getAdyenConfigByMerchantAccount(
  merchantAccount: string
): Promise<AdyenConfig | null> {
  // TODO: 从 DynamoDB 根据 merchantAccount 获取配置
  return {
    id: "mock-id",
    name: "Default Adyen",
    merchantAccount,
    apiKeyEncrypted: "mock-api-key",
    hmacKeyEncrypted: "mock-hmac-key",
    clientKey: "mock-client-key",
    environment: "test",
    storefrontUrl: "https://your-storefront.com",
    channelSlugs: ["default-channel"],
    saleorApiUrl: "https://your-saleor.com/graphql/",
    token: "mock-token",
  };
}