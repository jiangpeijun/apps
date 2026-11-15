// apps/adyen/src/app/api/webhooks/adyen/route.ts
import { hmacValidator } from "@adyen/api-library";
import { env } from "@/lib/env";

// 1. 定义 Adyen 的 Body 结构，解决 unknown 报错
interface AdyenWebhookBody {
  notificationItems: Array<{
    NotificationRequestItem: {
      eventCode: string;
      merchantAccountCode: string;
      merchantReference: string;
      pspReference: string;
      success: string;
      amount: {
        currency: string;
        value: number;
      };
      additionalData?: Record<string, string>;
    };
  }>;
}

// 2. 定义 Saleor 的响应结构，解决 json unknown 报错
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
    // 👇 断言类型，解决 body 报错
    const body = (await req.json()) as AdyenWebhookBody;
    const validator = new hmacValidator();
    const notificationItems = body.notificationItems || [];

    for (const item of notificationItems) {
      const notification = item.NotificationRequestItem;
      if (!notification) continue;

      // 使用 env 获取 HMAC Key
      const hmacKey = env.ADYEN_HMAC_KEY || "";
      const isValid = validator.validateHMAC(notification, hmacKey);

      if (!isValid) {
        console.warn("⚠️ Adyen HMAC validation failed", notification.pspReference);
        continue;
      }

      if (notification.success !== "true") continue;

      const { eventCode, pspReference, amount, merchantAccountCode } = notification;

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

      // 3. 根据 pspReference 反查交易记录
      const transactionRecord = await getTransactionIdByPspReference(pspReference);
      if (!transactionRecord) {
        console.error(`❌ 找不到对应的 Saleor 交易: ${pspReference}`);
        continue;
      }

      // 4. TODO: 根据 merchantAccountCode 获取对应的 Saleor 配置 (API URL, Token)
      // 实际开发中请使用你写的 getAdyenConfigByMerchantAccount
      const saleorConfig = {
        url: "http://localhost:8000/graphql/", 
        token: "YOUR_SALEOR_APP_TOKEN",
      };

      // 5. 调用 Saleor GraphQL 报告状态
      await reportToSaleor(saleorConfig, {
        transactionId: transactionRecord.transactionId,
        pspReference,
        result: saleorEventType,
        // 注意：Adyen 返回的是最小单位（如 1050），需转回主单位。实际应根据币种精度处理
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
  // TODO: 从 DynamoDB 查表。你在 transaction-initialize-session 时存入的记录
  // 示例返回:
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

    // 👇 断言类型，解决 json 报错
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