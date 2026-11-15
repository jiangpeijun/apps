// apps/adyen/src/app/api/webhooks/saleor/transaction-initialize-session/use-case.ts
import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { resolveAdyenAmount } from "@/modules/adyen/adyen-money";
import { withTimeout, ADYEN_TIMEOUT_MS } from "@/modules/adyen/adyen-timeout";
import { TransactionInitializeSessionEventData } from "@/generated/app-webhooks-types/transaction-initialize-session";
import { AdyenConfig } from "@/modules/app-config/domain/adyen-config";
import { saveTransactionMapping } from "@/modules/adyen/transaction-recorder"; // 👈 引入存库函数

export async function transactionInitializeSessionUseCase(params: {
  event: TransactionInitializeSessionEventData;
  config: AdyenConfig;
  saleorApiUrl: string; // 👈 新增
  token: string;        // 👈 新增
}) {
  const { event, config, saleorApiUrl, token } = params;
  
  const adyen = createAdyenClient({
    apiKey: config.apiKeyEncrypted,
    environment: config.environment,
  });

  const saleorAmount = event.action.amount.amount;
  const saleorCurrency = event.action.amount.currency;
  const adyenAmount = resolveAdyenAmount({ amount: saleorAmount, currency: saleorCurrency });

  const reference = `saleor-${event.transaction.id}-${Date.now()}`;

  try {
    const link = await withTimeout(
      adyen.paymentLinksApi.paymentLinks({
        amount: adyenAmount,
        reference,
        merchantAccount: config.merchantAccount,
        returnUrl: `${config.storefrontUrl}/checkout/adyen-return`,
        countryCode: event.action.checkout?.billingAddress?.country?.code ?? undefined,
      }),
      ADYEN_TIMEOUT_MS,
      "Adyen paymentLinks"
    );

    // 👇 核心：存入 DynamoDB
    await saveTransactionMapping({
      pspReference: link.id,
      transactionId: event.transaction.id,
      saleorApiUrl,
      token,
    });

    return {
      result: "CHARGE_ACTION_REQUIRED" as const,
      pspReference: link.id,
      amount: saleorAmount, 
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
      message: errorMessage.substring(0, 512),
    };
  }
}