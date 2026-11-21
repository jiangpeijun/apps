import type { AdyenConfig } from "@/modules/app-config/domain/adyen-config";

export const mockAdyenConfig: AdyenConfig = {
  id: "mock-id",
  name: "Mock Adyen",
  merchantAccount: "StarmerxECOM",
  publishableKey: "test_mockKey",
  restrictedKey: "****1234",
  environment: "test",
} as unknown as AdyenConfig;
