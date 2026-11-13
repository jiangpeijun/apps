import { type AdyenConfig } from "@/modules/app-config/domain/adyen-config";

export class AppRootConfig {
  readonly chanelConfigMapping: Record<string, string>;
  readonly adyenConfigsById: Record<string, AdyenConfig>;

  constructor(
    chanelConfigMapping: Record<string, string>,
    adyenConfigsById: Record<string, AdyenConfig>,
  ) {
    this.chanelConfigMapping = chanelConfigMapping;
    this.adyenConfigsById = adyenConfigsById;
  }

  getAllConfigsAsList() {
    return Object.values(this.adyenConfigsById);
  }

  getChannelsBoundToGivenConfig(configId: string) {
    const keyValues = Object.entries(this.chanelConfigMapping);
    const filtered = keyValues.filter(([_, value]) => value === configId);

    return filtered.map(([channelId]) => channelId);
  }
}
