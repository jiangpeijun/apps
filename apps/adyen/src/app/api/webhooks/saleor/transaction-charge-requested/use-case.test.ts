// apps\adyen\src\app\api\webhooks\saleor\transaction-charge-requested\use-case.test.ts
import { err, ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import { mockedAppConfigRepo } from "@/__tests__/mocks/app-config-repo";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { AppIsNotConfiguredResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { TransactionChargeRequestedUseCase } from "./use-case";
import { TransactionChargeRequestedUseCaseResponses } from "./use-case-response";
import { createAdyenClient } from "@/modules/adyen/adyen-client";

// Mock Adyen Client
vi.mock("@/modules/adyen/adyen-client", () => ({
  createAdyenClient: vi.fn(),
}));

describe("TransactionChargeRequestedUseCase", () => {
  const mockGetAdyenConfig = vi.spyOn(mockedAppConfigRepo, "getAdyenConfig");

  const event = {
    idempotencyKey: "idemp_123",
    action: { amount: 10 },
    transaction: {
      id: "tx_123",
      pspReference: "psp_123",
      checkout: { id: "chk_123", channel: { id: "channel_1", slug: "default" } },
      order: null,
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdyenConfig.mockResolvedValue(ok({
      id: "config_id", name: "Test", merchantAccount: "merchant", apiKeyEncrypted: "key",
      hmacKeyEncrypted: "hmac", clientKey: "client", environment: "test",
      storefrontUrl: "http://localhost", channelSlugs: [], saleorApiUrl: "http://localhost", token: "token"
    }));
  });

  it("Returns Success when Adyen capture succeeds", async () => {
    const mockCapture = vi.fn().mockResolvedValue({});
    (createAdyenClient as any).mockReturnValue({
      modificationsApi: { captureAuthorisedPayment: mockCapture },
    });

    const uc = new TransactionChargeRequestedUseCase({ appConfigRepo: mockedAppConfigRepo });
    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: "app_123",
      event,
    });

    expect(result._unsafeUnwrap()).toBeInstanceOf(TransactionChargeRequestedUseCaseResponses.Success);
    expect(mockCapture).toHaveBeenCalledWith("psp_123", expect.anything());
  });

  it("Returns Failure when Adyen capture throws", async () => {
    const mockCapture = vi.fn().mockRejectedValue(new Error("Adyen error"));
    (createAdyenClient as any).mockReturnValue({
      modificationsApi: { captureAuthorisedPayment: mockCapture },
    });

    const uc = new TransactionChargeRequestedUseCase({ appConfigRepo: mockedAppConfigRepo });
    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: "app_123",
      event,
    });

    expect(result._unsafeUnwrap()).toBeInstanceOf(TransactionChargeRequestedUseCaseResponses.Failure);
  });

  it("Returns MissingConfigErrorResponse if config not found", async () => {
    mockGetAdyenConfig.mockResolvedValueOnce(ok(null));

    const uc = new TransactionChargeRequestedUseCase({ appConfigRepo: mockedAppConfigRepo });
    const result = await uc.execute({
      saleorApiUrl: mockedSaleorApiUrl,
      appId: "app_123",
      event,
    });

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(AppIsNotConfiguredResponse);
  });
});