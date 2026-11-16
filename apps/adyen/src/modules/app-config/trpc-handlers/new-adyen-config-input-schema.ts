// apps/adyen/src/modules/app-config/trpc-handlers/new-adyen-config-input-schema.ts
import { z } from "zod";

export const newAdyenConfigInputSchema = z.object({
  name: z.string().min(1, "Configuration name is required"),
  merchantAccount: z.string().min(1, "Merchant Account is required"),
  apiKey: z.string().min(1, "API Key is required"),
  clientKey: z.string().min(1, "Client Key is required"),
  hmacKey: z.string().min(1, "HMAC Key is required"),
});