import { captureMessage } from "@sentry/nextjs";
import { z } from "zod";

const AdyenRefundIdSchema = z
  .string()
  .refine((v) => {
    const expectedPrefix = [
      // Standard Adyen refund
      "re_",
      // Refund for an external system like PayPal
      "pyr_",
    ];

    if (!expectedPrefix.some((prefix) => v.startsWith(prefix))) {
      captureMessage("Received unexpected Adyen Refund ID format", (scope) => {
        scope.setLevel("warning");
        scope.setExtra("adyenRefundId", v);

        return scope;
      });
    }

    return true;
  })
  .brand("AdyenRefundId");

export const createAdyenRefundId = (raw: string) => AdyenRefundIdSchema.parse(raw);

export type AdyenRefundId = z.infer<typeof AdyenRefundIdSchema>;
