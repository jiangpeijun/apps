import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { resolveAdyenAmount } from "@/modules/adyen/adyen-money";
import { withTimeout, ADYEN_TIMEOUT_MS } from "@/modules/adyen/adyen-timeout";
// 现在这个引入完全合法了，因为文件里已经包含了这个 interface
import { TransactionInitializeSessionEventData } from "@/generated/app-webhooks-types/transaction-initialize-session";
import { AdyenConfig } from "@/modules/app-config/domain/adyen-config";

export async function transactionInitializeSessionUseCase(params: {
  event: TransactionInitializeSessionEventData;
  config: AdyenConfig;
}) {
  const { event, config } = params;
  
  const adyen = createAdyenClient({
    apiKey: config.apiKeyEncrypted,
    environment: config.environment,
  });

  // 1. 原始金额
  const saleorAmount = event.action.amount.amount;
  const saleorCurrency = event.action.amount.currency;

  // 2. Adyen 最小单位金额
  const adyenAmount = resolveAdyenAmount({
    amount: saleorAmount,
    currency: saleorCurrency,
  });

  const reference = `saleor-${event.transaction.id}-${Date.now()}`;

  try {
    // 3. 新版 SDK 调用
    const link = await withTimeout(
      adyen.paymentLinksApi.paymentLinks({
        amount: adyenAmount,
        reference,
        merchantAccount: config.merchantAccount,
        returnUrl: `${config.storefrontUrl}/checkout/adyen-return`,
        countryCode:
          event.action.checkout?.billingAddress?.country?.code ?? undefined,
      }),
      ADYEN_TIMEOUT_MS,
      "Adyen paymentLinks"
    );

    return {
      result: "CHARGE_ACTION_REQUIRED" as const,
      pspReference: link.id,
      amount: saleorAmount, // 原金额
      externalUrl: link.url,
      data: {
        paymentUrl: link.url,
        paymentLinkId: link.id,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Adyen timeout or error";
    
    return {
      result: "CHARGE_FAILURE" as const,
      amount: saleorAmount,
      message: errorMessage.substring(0, 512), // 截断防止超长
    };
  }
}