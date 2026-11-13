import { createAdyenPublishableKey } from "@/modules/adyen/adyen-publishable-key";

export const mockedAdyenPublishableKey = createAdyenPublishableKey("pk_live_1")._unsafeUnwrap();
export const mockedAdyenPublishableKeyTest =
  createAdyenPublishableKey("pk_test_1")._unsafeUnwrap();
