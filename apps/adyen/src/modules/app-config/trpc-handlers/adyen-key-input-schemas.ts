import { z } from "zod";

import {
  createAdyenPublishableKey,
  type AdyenPublishableKey,
} from "@/modules/adyen/adyen-publishable-key";
import {
  createAdyenRestrictedKey,
  type AdyenRestrictedKey,
} from "@/modules/adyen/adyen-restricted-key";

/**
 * Key parsers shared by the create and update inputs, so both reject the same values with the
 * same messages.
 */

export const PUBLISHABLE_KEY_FORMAT_MESSAGE =
  "Invalid Publishable Key format. Must start with 'pk_test_' or 'pk_live_'.";

export const RESTRICTED_KEY_FORMAT_MESSAGE =
  "Invalid Restricted Key format. Must start with 'rk_test_' or 'rk_live_'.";

export const hasPublishableKeyPrefix = (value: string) =>
  value.startsWith("pk_test_") || value.startsWith("pk_live_");

export const hasRestrictedKeyPrefix = (value: string) =>
  value.startsWith("rk_test_") || value.startsWith("rk_live_");

export const adyenPublishableKeyInputSchema = z
  .string()
  .transform((value, ctx): AdyenPublishableKey => {
    if (!hasPublishableKeyPrefix(value)) {
      ctx.addIssue({
        message: PUBLISHABLE_KEY_FORMAT_MESSAGE,
        code: z.ZodIssueCode.custom,
        /**
         * Fatal flag is needed to avoid executing "refine" later.
         * So only if keys validation succeeds, refine is executed, otherwise it's aborted earlier.
         *
         * Without this flag, refine doesn't receive values anymore and it fails internally to validate
         */
        fatal: true,
      });

      return z.NEVER;
    }

    return createAdyenPublishableKey(value).match(
      (parsed) => parsed,
      () => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid Publishable Key format",
          fatal: true,
        });

        return z.NEVER;
      },
    );
  });

export const adyenRestrictedKeyInputSchema = z
  .string()
  .transform((value, ctx): AdyenRestrictedKey => {
    if (!hasRestrictedKeyPrefix(value)) {
      ctx.addIssue({
        message: RESTRICTED_KEY_FORMAT_MESSAGE,
        code: z.ZodIssueCode.custom,
        fatal: true,
      });

      return z.NEVER;
    }

    return createAdyenRestrictedKey(value).match(
      (parsed) => parsed,
      () => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid Restricted Key format",
          fatal: true,
        });

        return z.NEVER;
      },
    );
  });

export const MIXED_KEY_ENVIRONMENTS_MESSAGE =
  "Both Publishable and Restricted Keys must be live or test";

export const adyenKeyEnv = (key: string): "TEST" | "LIVE" =>
  key.startsWith("pk_test") || key.startsWith("rk_test") ? "TEST" : "LIVE";

export const keysShareEnvironment = (keys: {
  publishableKey: string;
  restrictedKey: string;
}): boolean => adyenKeyEnv(keys.publishableKey) === adyenKeyEnv(keys.restrictedKey);
