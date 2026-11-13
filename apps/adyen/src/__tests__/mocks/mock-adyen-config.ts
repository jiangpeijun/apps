import { mockedConfigurationId } from "@/__tests__/mocks/constants";
import { mockedAdyenPublishableKey } from "@/__tests__/mocks/mocked-adyen-publishable-key";
import { mockedAdyenRestrictedKey } from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { mockAdyenWebhookSecret } from "@/__tests__/mocks/adyen-webhook-secret";
import { AdyenConfig } from "@/modules/app-config/domain/adyen-config";

export const mockedAdyenConfig = AdyenConfig.create({
  id: mockedConfigurationId,
  name: "config-name",
  publishableKey: mockedAdyenPublishableKey,
  restrictedKey: mockedAdyenRestrictedKey,
  webhookSecret: mockAdyenWebhookSecret,
  webhookId: "wh_123456789",
})._unsafeUnwrap();
