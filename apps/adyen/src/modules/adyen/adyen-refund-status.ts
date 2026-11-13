import { z } from "zod";

const AdyenRefundStatusSchema = z
  .enum(["pending", "succeeded", "failed", "canceled", "requires_action"])
  .brand("AdyenRefundStatus");

export const createAdyenRefundStatus = (raw: string | null) => AdyenRefundStatusSchema.parse(raw);

export type AdyenRefundStatus = z.infer<typeof AdyenRefundStatusSchema>;
