import { describe, expect, it } from "vitest";

import { mockedAdyenPublishableKey } from "@/__tests__/mocks/mocked-adyen-publishable-key";

import { PaymentGatewayInitializeSessionUseCaseResponses } from "./use-case-response";

describe("PaymentGatewayInitializeSessionUseCaseResponses", () => {
  describe("Success", () => {
    it("getResponse() returns valid Response with status 200 and formatted 'data' object containing Adyen PK", async () => {
      const successResponse = new PaymentGatewayInitializeSessionUseCaseResponses.Success({
        pk: mockedAdyenPublishableKey,
        appContext: {
          adyenEnv: "LIVE",
        },
      });
      const fetchReponse = successResponse.getResponse();

      expect(fetchReponse.status).toBe(200);
      expect(await fetchReponse.json()).toMatchInlineSnapshot(`
        {
          "data": {
            "adyenPublishableKey": "pk_live_1",
          },
        }
      `);
    });
  });
});
