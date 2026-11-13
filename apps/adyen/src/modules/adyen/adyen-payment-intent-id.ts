import { captureMessage } from "@sentry/nextjs";
import { z } from "zod";

import { BaseError } from "@/lib/errors";

export const AdyenPaymentIntentValidationError = BaseError.subclass(
  "AdyenPaymentIntentValidationError",
  {
    props: {
      _internalName: "AdyenPaymentIntentValidationError" as const,
    },
  },
);

const AdyenPaymentIntentIdSchema = z
  .string({
    required_error: "Payment intent id is required",
  })
  .min(1)
  .refine((v) => {
    if (!v.startsWith("pi_")) {
      captureMessage("Received unexpected Adyen Payment Intent ID format", (scope) => {
        scope.setLevel("warning");
        scope.setExtra("adyenPaymentIntentId", v);

        return scope;
      });
    }

    return true;
  })
  .brand("AdyenPaymentIntentId");

export const createAdyenPaymentIntentId = (raw: string) => AdyenPaymentIntentIdSchema.parse(raw);

export type AdyenPaymentIntentId = z.infer<typeof AdyenPaymentIntentIdSchema>;
