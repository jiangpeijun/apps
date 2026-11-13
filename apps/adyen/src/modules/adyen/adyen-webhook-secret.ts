import { captureMessage } from "@sentry/nextjs";
import { fromThrowable } from "neverthrow";
import { z } from "zod";

import { BaseError } from "@/lib/errors";

export const AdyenWebhookSecretValidationError = BaseError.subclass(
  "AdyenWebhookSecretValidationError",
  {
    props: {
      _internalName: "AdyenWebhookSecretValidationError" as const,
    },
  },
);

export const AdyenWebhookSecretSchema = z
  .string()
  .min(1)
  .refine((v) => {
    if (!v.startsWith("whsec_")) {
      captureMessage("Received unexpected Adyen Webhook Secret format", (scope) => {
        scope.setLevel("warning");
        scope.setExtra("first4letters", v.slice(0, 4));

        return scope;
      });
    }

    return true;
  })
  .brand("AdyenWebhookSecret");

export const createAdyenWebhookSecret = (raw: string | null) =>
  fromThrowable(AdyenWebhookSecretSchema.parse, (error) =>
    AdyenWebhookSecretValidationError.normalize(error),
  )(raw);

export type AdyenWebhookSecret = z.infer<typeof AdyenWebhookSecretSchema>;
