// apps/adyen/src/modules/app-config/domain/adyen-config.ts

// 前端 UI 需要的序列化字段类型
export type AdyenFrontendConfigSerializedFields = {
  id: string;
  name: string;
  environment: "test" | "live";
  clientKey: string;
  channelSlugs: string[];
  webhookStatus?: "active" | "disabled" | "missing"; // 兼容旧代码里的状态判断
};

export class AdyenFrontendConfig implements AdyenFrontendConfigSerializedFields {
  readonly id: string;
  readonly name: string;
  readonly environment: "test" | "live";
  readonly clientKey: string;
  readonly channelSlugs: string[];
  readonly webhookStatus?: "active" | "disabled" | "missing";

  constructor(data: AdyenFrontendConfigSerializedFields) {
    this.id = data.id;
    this.name = data.name;
    this.environment = data.environment;
    this.clientKey = data.clientKey;
    this.channelSlugs = data.channelSlugs;
    this.webhookStatus = data.webhookStatus;
  }

  static createFromSerializedFields(data: AdyenFrontendConfigSerializedFields) {
    return new AdyenFrontendConfig(data);
  }

  getAdyenEnvValue(): "TEST" | "LIVE" {
    return this.environment === "live" ? "LIVE" : "TEST";
  }
}

// 后端全量配置接口（保留）
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