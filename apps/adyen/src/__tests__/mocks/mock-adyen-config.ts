import { mockedConfigurationId } from "@/__tests__/mocks/constants";
import { mockedStripePublishableKey } from "@/__tests__/mocks/mocked-adyen-publishable-key";
import { mockedStripeRestrictedKey } from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { mockStripeWebhookSecret } from "@/__tests__/mocks/adyen-webhook-secret";
import { StripeConfig } from "@/modules/app-config/domain/adyen-config";

export const mockedStripeConfig = StripeConfig.create({
  id: mockedConfigurationId,
  name: "config-name",
  publishableKey: mockedStripePublishableKey,
  restrictedKey: mockedStripeRestrictedKey,
  webhookSecret: mockStripeWebhookSecret,
  webhookId: "wh_123456789",
})._unsafeUnwrap();
