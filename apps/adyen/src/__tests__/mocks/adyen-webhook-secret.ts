import { createStripeWebhookSecret } from "@/modules/adyen/stripe-webhook-secret";

export const mockStripeWebhookSecret = createStripeWebhookSecret("whsec_XYZ")._unsafeUnwrap();
