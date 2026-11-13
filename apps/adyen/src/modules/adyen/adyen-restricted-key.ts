import { captureMessage } from "@sentry/nextjs";
import { fromThrowable } from "neverthrow";
import { z } from "zod";

import { BaseError } from "@/lib/errors";

export const AdyenRestrictedKeyValidationError = BaseError.subclass(
  "AdyenRestrictedKeyValidationError",
  {
    props: {
      _internalName: "AdyenRestrictedKeyValidationError" as const,
    },
  },
);

export const AdyenRestrictedKeySchema = z
  .string()
  .min(1)
  .refine((value) => {
    const expected = value.startsWith("rk_test_") || value.startsWith("rk_live_");

    if (!expected) {
      captureMessage("Received unexpected Adyen PK format", (scope) => {
        scope.setLevel("warning");
        scope.setExtra("first8letters", value.slice(0, 8));

        return scope;
      });
    }

    return true;
  })
  .brand("AdyenRestrictedKey");

export const createAdyenRestrictedKey = (raw: string | null) =>
  fromThrowable(AdyenRestrictedKeySchema.parse, (error) =>
    AdyenRestrictedKeyValidationError.normalize(error),
  )(raw);

export type AdyenRestrictedKey = z.infer<typeof AdyenRestrictedKeySchema>;
