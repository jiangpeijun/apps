import { createAdyenRestrictedKey } from "@/modules/adyen/adyen-restricted-key";

export const mockedAdyenRestrictedKey = createAdyenRestrictedKey(
  "rk_live_AAAAABBBBCCCCCEEEEEEEFFFFFGGGGG",
)._unsafeUnwrap();

export const mockedAdyenRestrictedKeyTest = createAdyenRestrictedKey(
  "rk_test_AAAAABBBBCCCCCEEEEEEEFFFFFGGGGG",
)._unsafeUnwrap();
