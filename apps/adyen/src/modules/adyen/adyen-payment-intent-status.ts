import { z } from "zod";

const AdyenPaymentIntentStatusSchema = z
  .enum([
    "requires_action",
    "requires_confirmation",
    "requires_payment_method",
    "canceled",
    "processing",
    "requires_capture",
    "succeeded",
  ])
  .brand("AdyenPaymentIntentStatus");

export const createAdyenPaymentIntentStatus = (raw: string) =>
  AdyenPaymentIntentStatusSchema.parse(raw);

export type AdyenPaymentIntentStatus = z.infer<typeof AdyenPaymentIntentStatusSchema>;
