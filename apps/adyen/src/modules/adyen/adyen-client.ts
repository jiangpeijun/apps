// apps\adyen\src\modules\adyen\adyen-client.ts
import { Client, CheckoutAPI, EnvironmentEnum } from "@adyen/api-library";

export interface AdyenClientConfig {
  apiKey: string;
  environment: "test" | "live";
}

export function createAdyenClient(config: AdyenClientConfig) {
  const client = new Client({
    apiKey: config.apiKey,
    // 修复枚举类型报错
    environment: config.environment === "live" ? EnvironmentEnum.LIVE : EnvironmentEnum.TEST,
  });
  
  const checkout = new CheckoutAPI(client);

  return {
    checkout,
    // 把需要用到的 API 实例暴露出来，方便 Use-Case 调用
    paymentLinksApi: checkout.PaymentLinksApi,
    paymentsApi: checkout.PaymentsApi,
    modificationsApi: checkout.ModificationsApi,
  };
}