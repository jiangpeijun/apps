import { createStripePublishableKey } from "@/modules/adyen/adyen-publishable-key";

export const mockedStripePublishableKey = createStripePublishableKey("pk_live_1")._unsafeUnwrap();
export const mockedStripePublishableKeyTest =
  createStripePublishableKey("pk_test_1")._unsafeUnwrap();
