import { fromThrowable } from "neverthrow";
import { z } from "zod";

import { BaseError } from "@/lib/errors";

export const AdyenClientSecretValidationError = BaseError.subclass(
  "AdyenClientSecretValidationError",
  {
    props: {
      _internalName: "AdyenClientSecretValidationError" as const,
    },
  },
);

export const AdyenClientSecretSchema = z.string().min(1).brand("AdyenClientSecret");

export const createAdyenClientSecret = (raw: string | null) =>
  fromThrowable(AdyenClientSecretSchema.parse, (error) =>
    AdyenClientSecretValidationError.normalize(error),
  )(raw);

export type AdyenClientSecret = z.infer<typeof AdyenClientSecretSchema>;
