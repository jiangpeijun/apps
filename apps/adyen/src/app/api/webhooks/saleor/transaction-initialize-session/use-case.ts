// apps/adyen/src/app/api/webhooks/saleor/transaction-initialize-session/use-case.ts
import { err, ok } from "neverthrow";
import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { resolveAdyenAmount } from "@/modules/adyen/adyen-money";
import { withTimeout, ADYEN_TIMEOUT_MS } from "@/modules/adyen/adyen-timeout";
import { type TransactionInitializeSessionEventFragment } from "@/generated/graphql";
import { appContextContainer } from "@/lib/app-context";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { saveTransactionMapping } from "@/modules/adyen/transaction-recorder";
import { TransactionInitializeSessionUseCaseResponses } from "./use-case-response";
import { parseTransactionInitializeSessionEventData } from "./event-data-parser";

export class TransactionInitializeSessionUseCase {
  private appConfigRepo: AppConfigRepo;

  constructor(deps: { appConfigRepo: AppConfigRepo }) {
    this.appConfigRepo = deps.appConfigRepo;
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionInitializeSessionEventFragment;
    token: string;
  }) {
    const { appId, saleorApiUrl, event, token } = args;
    const channelId = event.sourceObject.channel.id;

    console.log(`\n🔥 [UseCase] 开始处理 TRANSACTION_INITIALIZE_SESSION, Channel: ${channelId}`);

    // 1. 解析前端传来的加密数据
    const parsedData = parseTransactionInitializeSessionEventData(event.data);
    if (parsedData.isErr()) {
      console.error('❌ [UseCase] 解析 event.data 失败:', parsedData.error);
      return err(new TransactionInitializeSessionUseCaseResponses.Failure({
        message: "Invalid payment data format",
        appContext: appContextContainer.getContextValue(),
      }));
    }

    const { paymentMethod, browserInfo, origin } = parsedData.value;
    console.log('🔥 [UseCase] 解析后的支付方式:', paymentMethod.type);
    console.log('🔥 [UseCase] 收到 browserInfo:', browserInfo ? '存在' : '缺失');

    // 2. 获取配置
    const configResult = await this.appConfigRepo.getAdyenConfig({ channelId, appId, saleorApiUrl });
    if (configResult.isErr() || !configResult.value) {
      console.error('❌ [UseCase] 获取 Adyen 配置失败');
      return err(new TransactionInitializeSessionUseCaseResponses.Failure({
        message: "No config found for channel",
        appContext: appContextContainer.getContextValue(),
      }));
    }

    const config = configResult.value;
    appContextContainer.set({ adyenEnv: config.environment === "live" ? "LIVE" : "TEST" });

    const adyen = createAdyenClient({
      apiKey: config.apiKeyEncrypted,
      environment: config.environment,
    });

    const adyenAmount = resolveAdyenAmount({
      amount: event.action.amount,
      currency: event.action.currency,
    });

    try {
      console.log('🔥 [UseCase] 准备调用 Adyen PaymentsApi...');
      
      // 3. 显式调用 Adyen PaymentsApi
      const paymentResponse = await withTimeout(
        adyen.checkout.PaymentsApi.payments({
          amount: adyenAmount,
          paymentMethod: paymentMethod as any,
          reference: `saleor-${event.transaction.id}`,
          merchantAccount: config.merchantAccount,
          returnUrl: `${config.storefrontUrl}/checkout/adyen-return`,
          browserInfo: browserInfo as any,
          origin: origin || config.storefrontUrl,
          shopperIP: (event as any).customerIpAddress || undefined,
          channel: "Web" as any,
        }),
        ADYEN_TIMEOUT_MS,
        "Adyen payments"
      );

      console.log('✅ [UseCase] Adyen API 返回, resultCode:', paymentResponse.resultCode);

      const pspReference = paymentResponse.pspReference;
      if (!pspReference) {
        throw new Error("Adyen API 没有返回 pspReference");
      }

      // 4. 记录映射关系（如果这里失败也会被 catch 捕获）
      console.log('🔥 [UseCase] 正在保存交易映射关系...');
      await saveTransactionMapping({
        pspReference,
        transactionId: event.transaction.id,
        saleorApiUrl,
        token,
      });
      console.log('✅ [UseCase] 映射关系保存成功');

      // 5. 处理响应
      const resultCode = paymentResponse.resultCode;

      if (resultCode === "Authorised" || resultCode === "Received") {
        return ok(new TransactionInitializeSessionUseCaseResponses.Success({
          pspReference,
          amount: event.action.amount,
          appContext: appContextContainer.getContextValue(),
        }));
      }

      if (["IdentifyShopper", "ChallengeShopper", "RedirectShopper"].includes(resultCode as string)) {
        console.log('🔥 [UseCase] 触发 3DS 验证');
        return ok(new TransactionInitializeSessionUseCaseResponses.ActionRequired({
          pspReference,
          amount: event.action.amount,
          adyenAction: paymentResponse.action,
          appContext: appContextContainer.getContextValue(),
        }));
      }

      console.warn('⚠️ [UseCase] 支付未成功:', paymentResponse.refusalReason);
      return err(new TransactionInitializeSessionUseCaseResponses.Failure({
        message: paymentResponse.refusalReason || `Payment failed: ${resultCode}`,
        appContext: appContextContainer.getContextValue(),
      }));

    } catch (error: any) {
      // 👈 终极拦截：如果 Adyen API 报错或 saveTransactionMapping 报错，这里会捕获，防止 500
      console.error("💥 [UseCase] 发生未捕获异常 (之前会导致 500):", error);
      return err(new TransactionInitializeSessionUseCaseResponses.Failure({
        message: error.message || "Internal Server Error in UseCase",
        appContext: appContextContainer.getContextValue(),
      }));
    }
  }
}