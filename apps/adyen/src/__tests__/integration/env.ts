import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DYNAMODB_MAIN_TABLE_NAME: z.string().min(1),
    INTEGRATION_SALEOR_API_URL: z.string().url().endsWith("/graphql/"),
    INTEGRATION_ADYEN_RK: z.string().min(1),
    INTEGRATION_ADYEN_PK: z.string().min(1),
    AWS_ENDPOINT_URL: z.string().url(),
    SECRET_KEY: z.string(),
    AWS_REGION: z.string(),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),
  },
  runtimeEnv: {
    DYNAMODB_MAIN_TABLE_NAME: process.env.DYNAMODB_MAIN_TABLE_NAME,
    INTEGRATION_SALEOR_API_URL: process.env.INTEGRATION_SALEOR_API_URL,
    INTEGRATION_ADYEN_RK: process.env.INTEGRATION_ADYEN_RK,
    INTEGRATION_ADYEN_PK: process.env.INTEGRATION_ADYEN_PK,
    AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL,
    SECRET_KEY: process.env.SECRET_KEY,
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_ACCESS_KEY_ID,
  },
});
