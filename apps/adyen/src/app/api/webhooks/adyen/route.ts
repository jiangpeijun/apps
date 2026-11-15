// apps/adyen/src/app/api/webhooks/adyen/route.ts
import { hmacValidator } from "@adyen/api-library";
import { env } from "@/lib/env";

// 1. 定义 Adyen 的 Body 结构
interface AdyenWebhookBody {
  notificationItems: Array<{
    NotificationRequestItem: {
      eventCode: string;
      merchantAccountCode: string;
      merchantReference: string;
      pspReference: string;
      success: string;
      eventDate?: string; // 加上 eventDate，虽然我们可能用不到，但加上更完整
      amount: {
        currency: string;
        value: number;
      };
      additionalData?: Record<string, string>;
    };
  }>;
}

// 2. 定义 Saleor 的响应结构
interface SaleorGraphQLResponse {
  errors?: Array<{ message: string }>;
  data?: {
    transactionEventReport?: {
      errors?: Array<{ field: string; message: string }>;
    };
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AdyenWebhookBody;
    const validator = new hmacValidator();
    const notificationItems = body.notificationItems || [];

    for (const item of notificationItems) {
      const notification = item.NotificationRequestItem;
      if (!notification) continue;

      const hmacKey = env.ADYEN_HMAC_KEY || "";
      
      // 👇 核心修复：使用 as any 绕过官方过于严格的必填字段检查
      const isValid = validator.validateHMAC(notification as any, hmacKey);

      if (!isValid) {
        console.warn("⚠️ Adyen HMAC validation failed", notification.pspReference);
        continue;
      }

      if (notification.success !== "true") continue;

      const { eventCode, pspReference, amount } = notification;

      let saleorEventType: "CHARGE_SUCCESS" | "REFUND_SUCCESS" | "CANCEL_SUCCESS" | null = null;

      switch (eventCode) {
        case "AUTHORISATION":
          saleorEventType = "CHARGE_SUCCESS";
          break;
        case "REFUND":
          saleorEventType = "REFUND_SUCCESS";
          break;
        case "CANCELLATION":
          saleorEventType = "CANCEL_SUCCESS";
          break;
      }

      if (!saleorEventType) continue;

      const transactionRecord = await getTransactionIdByPspReference(pspReference);
      if (!transactionRecord) {
        console.error(`❌ 找不到对应的 Saleor 交易: ${pspReference}`);
        continue;
      }

      const saleorConfig = {
        url: "http://localhost:8000/graphql/", 
        token: "YOUR_SALEOR_APP_TOKEN",
      };

      await reportToSaleor(saleorConfig, {
        transactionId: transactionRecord.transactionId,
        pspReference,
        result: saleorEventType,
        amount: amount.value / 100, 
        currency: amount.currency,
      });
    }

    return new Response("[accepted]", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("Adyen Webhook Error:", error);
    return new Response("[accepted]", { status: 200 });
  }
}

// --- 辅助函数 ---

async function getTransactionIdByPspReference(pspReference: string) {
  return { transactionId: "mock-transaction-id-123" }; 
}

async function reportToSaleor(
  config: { url: string; token: string },
  params: {
    transactionId: string;
    pspReference: string;
    result: string;
    amount: number;
    currency: string;
  }
) {
  const mutation = `
    mutation TransactionEventReport(
      $transactionId: ID!
      $pspReference: String!
      $type: TransactionEventReportType!
      $amount: PositiveDecimal!
    ) {
      transactionEventReport(
        id: $transactionId
        pspReference: $pspReference
        type: $type
        amount: $amount
      ) {
        errors { field message }
        transactionEvent { id }
      }
    }
  `;

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          transactionId: params.transactionId,
          pspReference: params.pspReference,
          type: params.result,
          amount: params.amount,
        },
      }),
    });

    const json = (await response.json()) as SaleorGraphQLResponse;
    
    if (json.errors || (json.data?.transactionEventReport?.errors?.length ?? 0) > 0) {
      console.error("❌ Saleor 报告失败:", json);
    } else {
      console.log(`✅ Saleor 报告成功: ${params.result} for ${params.transactionId}`);
    }
  } catch (err) {
    console.error("❌ 请求 Saleor API 失败:", err);
  }
}