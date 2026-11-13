import { z } from "zod";

import {
  keysShareEnvironment,
  MIXED_KEY_ENVIRONMENTS_MESSAGE,
  adyenPublishableKeyInputSchema,
  adyenRestrictedKeyInputSchema,
} from "@/modules/app-config/trpc-handlers/adyen-key-input-schemas";

export const newAdyenConfigInputSchema = z
  .object({
    name: z.string().min(1),
    publishableKey: adyenPublishableKeyInputSchema,
    restrictedKey: adyenRestrictedKeyInputSchema,
  })
  .refine(keysShareEnvironment, {
    message: MIXED_KEY_ENVIRONMENTS_MESSAGE,
  });

export type NewAdyenConfigInput = z.infer<typeof newAdyenConfigInputSchema>;
