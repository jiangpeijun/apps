// apps\adyen\src\app\api\webhooks\saleor\payment-gateway-initialize-session\use-case-response.test.ts
import { describe, expect, it } from "vitest";
import { PaymentGatewayInitializeSessionUseCaseResponses } from "./use-case-response";

describe("PaymentGatewayInitializeSessionUseCaseResponses", () => {
  describe("Success", () => {
    it("getResponse() returns valid Response with status 200 and formatted 'data' object containing Adyen ClientKey", async () => {
      const successResponse = new PaymentGatewayInitializeSessionUseCaseResponses.Success({
        clientKey: "test_client_key_123",
        environment: "TEST",
        appContext: { adyenEnv: "TEST" },
      });
      
      const fetchResponse = successResponse.getResponse();

      expect(fetchResponse.status).toBe(200);
      expect(await fetchResponse.json()).toEqual({
        data: {
          clientKey: "test_client_key_123",
          environment: "TEST",
        },
      });
    });
  });
});
