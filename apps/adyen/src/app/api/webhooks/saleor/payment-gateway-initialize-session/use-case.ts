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
import { PaymentGatewayInitializeSessionUseCaseResponses } from "./use-case-response";

export class PaymentGatewayInitializeSessionUseCase {
  private appConfigRepo: AppConfigRepo;
  private logger = createLogger("PaymentGatewayInitializeSessionUseCase");

  constructor(deps: { appConfigRepo: AppConfigRepo }) {
    this.appConfigRepo = deps.appConfigRepo;
  }

  async execute(params: any) {
    // 👇 只要这个没打印，就绝对说明跑的不是这个文件！
    console.log("🔥🔥🔥 [Adyen Init Debug] UseCase START !!", params.channelId);

    const { channelId, appId, saleorApiUrl, event } = params;

    try {
      const adyenConfigResult = await this.appConfigRepo.getAdyenConfig({ channelId, appId, saleorApiUrl });
      
      console.log("🔥 [Adyen Init Debug] DB 查询结果:", adyenConfigResult);

      if (adyenConfigResult.isErr()) {
        console.error("❌ [Adyen Init Debug] DB 报错:", adyenConfigResult.error);
        return err(new BrokenAppResponse(appContextContainer.getContextValue(), adyenConfigResult.error));
      }

      const config = adyenConfigResult.value;
      if (!config || !config.clientKey) {
        console.error("❌ [Adyen Init Debug] Config 为空或 clientKey 为空");
        return err(new AppIsNotConfiguredResponse(appContextContainer.getContextValue(), new BaseError("Config not found")));
      }

      appContextContainer.set({ adyenEnv: config.environment === "live" ? "LIVE" : "TEST" });

      const adyenClient = createAdyenClient({
        apiKey: config.apiKeyEncrypted,
        environment: config.environment,
      });

      const checkout = event.sourceObject as any;
      if (!checkout || !checkout.totalPrice) {
        console.error("❌ [Adyen Init Debug] sourceObject 无效:", checkout);
        return err(new BrokenAppResponse(appContextContainer.getContextValue(), new BaseError("Invalid source object")));
      }

      const amount = resolveAdyenAmount({
        amount: checkout.totalPrice?.gross?.amount || 0,
        currency: checkout.totalPrice?.gross?.currency || "JPY",
      });

      console.log("🔥 [Adyen Init Debug] 准备请求 Adyen API，参数如下：", {
        merchantAccount: config.merchantAccount,
        amount,
        countryCode: checkout.billingAddress?.country?.code || "JP",
      });

      const paymentMethodsResponse = await adyenClient.paymentsApi.paymentMethods({
        merchantAccount: config.merchantAccount,
        amount: amount,
        countryCode: checkout.billingAddress?.country?.code || "JP",
        channel: "Web" as any,
      });

      console.log("✅ [Adyen Init Debug] Adyen API 成功返回！");

      return ok(
        new PaymentGatewayInitializeSessionUseCaseResponses.Success({
          clientKey: config.clientKey,
          environment: config.environment,
          paymentMethodsResponse: paymentMethodsResponse,
          appContext: appContextContainer.getContextValue(),
        })
      );
    } catch (error: any) {
      console.error("❌ [Adyen Init Debug] Catch 到异常:", error);
      return err(new BrokenAppResponse(appContextContainer.getContextValue(), BaseError.normalize(error)));
    }
  }
}