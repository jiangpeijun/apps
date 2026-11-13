import { createAdyenWebhookSecret } from "@/modules/adyen/adyen-webhook-secret";

export const mockAdyenWebhookSecret = createAdyenWebhookSecret("whsec_XYZ")._unsafeUnwrap();
