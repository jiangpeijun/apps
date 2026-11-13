import { type AuthData } from "@saleor/app-sdk/APL";

import { createInstrumentedGraphqlClient } from "@/lib/graphql-client";

import { AdyenProblemReporter } from "./adyen-problem-reporter";

export function createAdyenProblemReporter(authData: AuthData): AdyenProblemReporter {
  const client = createInstrumentedGraphqlClient(authData);

  return new AdyenProblemReporter(client);
}
