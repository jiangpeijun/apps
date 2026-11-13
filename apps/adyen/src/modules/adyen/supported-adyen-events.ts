import type { Adyen } from "adyen";

export const supportedAdyenEvents: Array<Adyen.WebhookEndpointCreateParams.EnabledEvent> = [
  "payment_intent.amount_capturable_updated",
  "payment_intent.payment_failed",
  "payment_intent.processing",
  "payment_intent.requires_action",
  "payment_intent.succeeded",
  "payment_intent.canceled",

  "charge.refund.updated",
];
