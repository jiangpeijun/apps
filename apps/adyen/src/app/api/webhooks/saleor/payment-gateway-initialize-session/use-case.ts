// apps/adyen/src/app/api/webhooks/saleor/payment-gateway-initialize-session/use-case.ts
import { err, ok, type Result } from "neverthrow";
import { AppIsNotConfiguredResponse, BrokenAppResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { resolveAdyenAmount } from "@/modules/adyen/adyen-money";
import { PaymentGatewayInitializeSessionUseCaseResponses, type PaymentGatewayInitializeSessionUseCaseResponsesType } from "./use-case-response";

export class PaymentGatewayInitializeSessionUseCase {
  private appConfigRepo: AppConfigRepo;
  private logger = createLogger("PaymentGatewayInitializeSessionUseCase");

  constructor(deps: { appConfigRepo: AppConfigRepo }) {
    this.appConfigRepo = deps.appConfigRepo;
  }

  async execute(params: {
    channelId: string;
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: any; // ctx.payload
  }): Promise<Result<PaymentGatewayInitializeSessionUseCaseResponsesType, AppIsNotConfiguredResponse | BrokenAppResponse>> {
    const { channelId, appId, saleorApiUrl, event } = params;

    const adyenConfigResult = await this.appConfigRepo.getAdyenConfig({ channelId, appId, saleorApiUrl });

    if (adyenConfigResult.isErr()) {
      return err(new BrokenAppResponse(appContextContainer.getContextValue(), adyenConfigResult.error));
    }

    const config = adyenConfigResult.value;
    if (!config || !config.clientKey) {
      return err(new AppIsNotConfiguredResponse(appContextContainer.getContextValue(), new BaseError("Config for channel not found")));
    }

    appContextContainer.set({ adyenEnv: config.environment === "live" ? "LIVE" : "TEST" });

    try {
      const adyenClient = createAdyenClient({
        apiKey: config.apiKeyEncrypted,
        environment: config.environment,
      });

      // ⚠️ 注意：如果你已经重新执行了 pnpm generate，把这里的 as any 去掉
      const checkout = event.sourceObject as any;
      
      if (!checkout || checkout.__typename !== 'Checkout') {
        return err(new BrokenAppResponse(appContextContainer.getContextValue(), new BaseError("Invalid source object")));
      }

      const amount = resolveAdyenAmount({
        amount: checkout.totalPrice?.gross?.amount || 0,
        currency: checkout.totalPrice?.gross?.currency || "JPY",
      });

      // ✅ 核心修复：通过 paymentsApi 获取支付方式
      const paymentMethodsResponse = await adyenClient.paymentsApi.paymentMethods({
        merchantAccount: config.merchantAccount,
        amount: amount,
        countryCode: checkout.billingAddress?.country?.code || "JP",
        channel: "Web" as any, // 转换 Adyen 的 channel 枚举类型
      });

      return ok(
        new PaymentGatewayInitializeSessionUseCaseResponses.Success({
          clientKey: config.clientKey,
          environment: config.environment,
          paymentMethodsResponse: paymentMethodsResponse,
          appContext: appContextContainer.getContextValue(),
        })
      );
    } catch (error) {
      this.logger.error("Failed to fetch Adyen payment methods", { error });
      return err(new BrokenAppResponse(appContextContainer.getContextValue(), BaseError.normalize(error)));
    }
  }
}