import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { resolveAdyenAmount } from "@/modules/adyen/adyen-money";
import { withTimeout, ADYEN_TIMEOUT_MS } from "@/modules/adyen/adyen-timeout";
import { TransactionRefundRequestedEventData } from "@/generated/app-webhooks-types/transaction-refund-requested";
import { AdyenConfig } from "@/modules/app-config/domain/adyen-config";

export async function transactionRefundRequestedUseCase(params: {
  event: TransactionRefundRequestedEventData;
  config: AdyenConfig;
}) {
  const { event, config } = params;
  const pspReference = event.transaction?.pspReference as string | undefined;
  const amount = event.action.amount;

  if (!pspReference) {
    return { 
      result: "REFUND_FAILURE" as const, 
      message: "Missing pspReference" 
    };
  }

  const adyen = createAdyenClient({
    apiKey: config.apiKeyEncrypted,
    environment: config.environment,
  });
  
  const adyenAmount = resolveAdyenAmount({
    amount: amount.amount,
    currency: amount.currency,
  });

  // 建议先不传 lineItems，因为 PaymentRefundRequest 类型结构可能不同。
  // 如果 Adyen 后台开启了强制验证 lineItems，再通过 additionalData 传。
  const lineItems = buildLineItemsForAdyen(event);

  try {
    // 👇 核心修复：方法名使用 refundCapturedPayment
    const response = await withTimeout<any>(
      adyen.modificationsApi.refundCapturedPayment(pspReference, {
        merchantAccount: config.merchantAccount,
        amount: adyenAmount,
        // 如果需要传明细，可以试试放在这里，但为了不报错，我们先注释掉
        // ...(lineItems.length > 0 ? { lineItems } : {}),
      }),
      ADYEN_TIMEOUT_MS,
      "Adyen refundCapturedPayment"
    );

    return {
      result: "REFUND_SUCCESS" as const,
      pspReference: response?.pspReference ?? pspReference,
      amount: amount.amount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Adyen refund failed";
    return {
      result: "REFUND_FAILURE" as const,
      amount: amount.amount,
      message: errorMessage.substring(0, 512),
    };
  }
}

function buildLineItemsForAdyen(
  event: TransactionRefundRequestedEventData
): Array<{
  id: string;
  amountExcludingTax: number;
  taxAmount: number;
  quantity: number;
  description: string;
}> {
  if (event.action.grantedRefund?.lines) {
    const items = event.action.grantedRefund.lines.map((line) => {
      const lineAdyenAmount = resolveAdyenAmount({
        amount: line.amount.amount,
        currency: line.amount.currency,
      });

      return {
        id: line.orderLineId,
        amountExcludingTax: lineAdyenAmount.value,
        taxAmount: 0,
        quantity: line.quantity,
        description: line.orderLine?.productName ?? "Item",
      };
    });
    
    if (event.action.grantedRefund.shippingCostIncluded) {
      items.push({
        id: "shipping",
        amountExcludingTax: 0, 
        taxAmount: 0,
        quantity: 1,
        description: "Shipping",
      });
    }
    return items;
  }

  return [];
}