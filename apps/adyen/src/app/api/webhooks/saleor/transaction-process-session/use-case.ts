// apps/adyen/src/app/api/webhooks/saleor/transaction-process-session/use-case.ts
import { err, ok } from "neverthrow";
import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { withTimeout, ADYEN_TIMEOUT_MS } from "@/modules/adyen/adyen-timeout";
import { type TransactionProcessSessionEventFragment } from "@/generated/graphql";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";

import { TransactionProcessSessionUseCaseResponses } from "./use-case-response";

export class TransactionProcessSessionUseCase {
  private appConfigRepo: AppConfigRepo;

  constructor(deps: { appConfigRepo: AppConfigRepo }) {
    this.appConfigRepo = deps.appConfigRepo;
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionProcessSessionEventFragment;
  }) {
    const { appId, saleorApiUrl, event } = args;
    
    // 👈 移除对 pspReference 的强制依赖，因为 3DS 回调时可能还没有最终 pspRef
    const channelId = (event as any).sourceObject?.channel?.id;
    const eventData = (event as any).data;

    console.log(`\n🔥 [ProcessSession UseCase] 开始处理, Channel: ${channelId}`);
    console.log(`🔥 [ProcessSession UseCase] 收到的 event.data (3DS结果):`, JSON.stringify(eventData, null, 2));

    if (!channelId) {
      console.error(`❌ [ProcessSession UseCase] 缺少 channelId`);
      return err(new BrokenAppResponse(
        appContextContainer.getContextValue(),
        new BaseError("Missing channelId") as any
      ));
    }

    // 1. 获取配置
    const configResult = await this.appConfigRepo.getAdyenConfig({
      channelId, appId, saleorApiUrl,
    });

    if (configResult.isErr()) {
      return err(new BrokenAppResponse(appContextContainer.getContextValue(), configResult.error));
    }

    const config = configResult.value;
    if (!config) {
      return err(new AppIsNotConfiguredResponse(
        appContextContainer.getContextValue(),
        new BaseError("No config found for channel")
      ));
    }

    appContextContainer.set({ adyenEnv: config.environment === "live" ? "LIVE" : "TEST" });

    const adyen = createAdyenClient({
      apiKey: config.apiKeyEncrypted,
      environment: config.environment,
    });

    try {
      if (!eventData) {
        throw new Error("Missing event.data for paymentsDetails");
      }

      console.log(`🔥 [ProcessSession UseCase] 准备调用 Adyen paymentsDetails...`);
      
      // 2. 显式调用 PaymentsApi.paymentsDetails
      const processResponse = await withTimeout(
        adyen.checkout.PaymentsApi.paymentsDetails({
          details: eventData.details || eventData, // 兼容前端传来的结构
        }),
        ADYEN_TIMEOUT_MS,
        "Adyen paymentsDetails"
      );

      console.log(`✅ [ProcessSession UseCase] Adyen API 返回, resultCode: ${processResponse.resultCode}`);

      const resultCode = processResponse.resultCode;
      const finalPspRef = processResponse.pspReference;

      // 👈 只有拿到最终的 pspReference，才能交给 Saleor 记账
      if (!finalPspRef) {
        throw new Error("Adyen 返回成功，但没有提供 pspReference");
      }

      // 3. 根据结果返回给 Saleor
      if (resultCode === "Authorised" || resultCode === "Received") {
        return ok(new TransactionProcessSessionUseCaseResponses.Success({
          pspReference: finalPspRef,
          amount: (event as any).action.amount,
          result: "CHARGE_SUCCESS",
          appContext: appContextContainer.getContextValue(),
        }));
      }

      console.warn(`⚠️ [ProcessSession UseCase] 支付失败/被拒:`, processResponse.refusalReason);
      
      return ok(new TransactionProcessSessionUseCaseResponses.Failure({
        pspReference: finalPspRef,
        amount: (event as any).action.amount,
        message: processResponse.refusalReason || `Payment failed: ${resultCode}`,
        appContext: appContextContainer.getContextValue(),
      }));

    } catch (error: any) {
      console.error("💥 [ProcessSession UseCase] 发生未捕获异常:", error);
      return ok(new TransactionProcessSessionUseCaseResponses.Failure({
        pspReference: (event as any).transaction?.pspReference || "unknown",
        amount: (event as any).action.amount,
        message: error.message || "Adyen process error",
        appContext: appContextContainer.getContextValue(),
      }));
    }
  }
}