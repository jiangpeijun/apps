import { captureMessage } from "@sentry/nextjs";
import { fromThrowable } from "neverthrow";
import { z } from "zod";

import { BaseError } from "@/lib/errors";

export const AdyenPublishableKeyValidationError = BaseError.subclass(
  "AdyenPublishableKeyValidationError",
  {
    props: {
      _internalName: "AdyenPublishableKeyValidationError" as const,
    },
  },
);

export const AdyenPublishableKeySchema = z
  .string()
  .min(1)
  .refine((value) => {
    const expected = value.startsWith("pk_test_") || value.startsWith("pk_live_");

    if (!expected) {
      captureMessage("Received unexpected Adyen PK format", (scope) => {
        scope.setLevel("warning");
        scope.setExtra("first8letters", value.slice(0, 8));

        return scope;
      });
    }

    return true;
  })
  .brand("AdyenPublishableKey");

export const createAdyenPublishableKey = (raw: string | null) =>
  fromThrowable(AdyenPublishableKeySchema.parse, (error) =>
    AdyenPublishableKeyValidationError.normalize(error),
  )(raw);

export type AdyenPublishableKey = z.infer<typeof AdyenPublishableKeySchema>;
