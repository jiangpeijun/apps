import { z } from "zod";

import {
  keysShareEnvironment,
  MIXED_KEY_ENVIRONMENTS_MESSAGE,
  adyenPublishableKeyInputSchema,
  adyenRestrictedKeyInputSchema,
} from "@/modules/app-config/trpc-handlers/adyen-key-input-schemas";

export const updateAdyenConfigInputSchema = z
  .object({
    configId: z.string().uuid(),
    name: z.string().min(1),
    publishableKey: adyenPublishableKeyInputSchema,
    /**
     * `null` keeps the stored key. The UI only receives the last 4 characters of the restricted
     * key, so the field starts empty and is only sent when someone pastes a new key.
     */
    restrictedKey: adyenRestrictedKeyInputSchema.nullable(),
  })
  .refine(
    ({ publishableKey, restrictedKey }) =>
      restrictedKey === null || keysShareEnvironment({ publishableKey, restrictedKey }),
    {
      message: MIXED_KEY_ENVIRONMENTS_MESSAGE,
    },
  );

export type UpdateAdyenConfigInput = z.infer<typeof updateAdyenConfigInputSchema>;
