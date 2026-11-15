// apps\adyen\src\app\api\webhooks\saleor\payment-gateway-initialize-session\use-case.test.ts
import { ok, err } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import { mockedAppConfigRepo } from "@/__tests__/mocks/app-config-repo";
import { mockedSaleorAppId, mockedSaleorChannelId } from "@/__tests__/mocks/constants";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { AppIsNotConfiguredResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { PaymentGatewayInitializeSessionUseCase } from "./use-case";
import { PaymentGatewayInitializeSessionUseCaseResponses } from "./use-case-response";
import { BaseError } from "@/lib/errors";

describe("PaymentGatewayInitializeSessionUseCase", () => {
  it('Returns Success response with clientKey within "data" object if found in configuration', async () => {
    vi.spyOn(mockedAppConfigRepo, "getAdyenConfig").mockImplementationOnce(async () => ok({
      id: "config_id",
      name: "Test Config",
      clientKey: "test_client_key",
      environment: "test",
      merchantAccount: "merchant",
      apiKeyEncrypted: "key",
      hmacKeyEncrypted: "hmac",
      storefrontUrl: "http://localhost",
      channelSlugs: ["default"],
      saleorApiUrl: "http://localhost",
      token: "token"
    }));

    const uc = new PaymentGatewayInitializeSessionUseCase({ appConfigRepo: mockedAppConfigRepo });
    const responsePayload = await uc.execute({
      channelId: mockedSaleorChannelId,
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
    });

    expect(responsePayload._unsafeUnwrap()).toBeInstanceOf(PaymentGatewayInitializeSessionUseCaseResponses.Success);
    const jsonResponse = await responsePayload._unsafeUnwrap().getResponse().json();
    expect(jsonResponse).toEqual({
      data: {
        clientKey: "test_client_key",
        environment: "test",
      },
    });
  });

  it("Returns MissingConfigErrorResponse if config not found for specified channel", async () => {
    vi.spyOn(mockedAppConfigRepo, "getAdyenConfig").mockImplementationOnce(async () => ok(null));

    const uc = new PaymentGatewayInitializeSessionUseCase({ appConfigRepo: mockedAppConfigRepo });
    const responsePayload = await uc.execute({
      channelId: mockedSaleorChannelId,
      saleorApiUrl: mockedSaleorApiUrl,
      appId: mockedSaleorAppId,
    });

    expect(responsePayload._unsafeUnwrapErr()).toBeInstanceOf(AppIsNotConfiguredResponse);
  });
});