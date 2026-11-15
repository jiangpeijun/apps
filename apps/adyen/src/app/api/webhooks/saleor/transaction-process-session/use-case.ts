import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { withTimeout, ADYEN_TIMEOUT_MS } from "@/modules/adyen/adyen-timeout";
import { TransactionProcessSessionEventData } from "@/generated/app-webhooks-types/transaction-process-session";
import { AdyenConfig } from "@/modules/app-config/domain/adyen-config";

export async function transactionProcessSessionUseCase(params: {
  event: TransactionProcessSessionEventData;
  config: AdyenConfig;
}) {
  const { event, config } = params;
  
  const pspReference = event.transaction?.pspReference;

  if (!pspReference) {
    return {
      result: "CHARGE_FAILURE" as const,
      amount: event.action.amount.amount,
      message: "Missing pspReference",
    };
  }

  const adyen = createAdyenClient({
    apiKey: config.apiKeyEncrypted,
    environment: config.environment,
  });

  try {
    // 👇 修复方法名：getPaymentLink（单数）
    const link = await withTimeout(
      adyen.paymentLinksApi.getPaymentLink(pspReference),
      ADYEN_TIMEOUT_MS,
      "Adyen getPaymentLink"
    );

    switch (link.status as string) {
      case "completed":
        return {
          result: "CHARGE_SUCCESS" as const,
          pspReference,
          amount: event.action.amount.amount,
        };
      case "expired":
      case "cancelled":
        return {
          result: "CHARGE_FAILURE" as const,
          pspReference,
          amount: event.action.amount.amount,
          message: `Payment link ${link.status}`,
        };
      case "active":
      default:
        return {
          result: "CHARGE_ACTION_REQUIRED" as const,
          pspReference,
          amount: event.action.amount.amount,
          externalUrl: link.url,
          data: { paymentUrl: link.url },
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Adyen query failed";
    return {
      result: "CHARGE_FAILURE" as const,
      amount: event.action.amount.amount,
      message: errorMessage.substring(0, 512),
    };
  }
}