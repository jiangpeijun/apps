// apps/adyen/src/app/api/webhooks/adyen/route.ts
import { hmacValidator } from "@adyen/api-library";
import { env } from "@/lib/env";
import { getTransactionMapping } from "@/modules/adyen/transaction-recorder";
import { createInstrumentedGraphqlClient } from "@/lib/graphql-client";
import { TransactionEventReportDocument } from "@/generated/graphql";

interface AdyenWebhookBody {
  notificationItems: Array<{
    NotificationRequestItem: {
      eventCode: string;
      merchantAccountCode: string;
      merchantReference: string;
      pspReference: string;
      success: string;
      eventDate?: string;
      amount: { currency: string; value: number };
      additionalData?: Record<string, string>;
    };
  }>;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AdyenWebhookBody;
    const validator = new hmacValidator();
    const notificationItems = body.notificationItems || [];

    for (const item of notificationItems) {
      const notification = item.NotificationRequestItem;
      if (!notification) continue;

      // 1. HMAC 验证
      const hmacKey = env.ADYEN_HMAC_KEY || "";
      const isValid = validator.validateHMAC(notification as any, hmacKey);

      if (!isValid) {
        console.warn("⚠️ Adyen HMAC validation failed", notification.pspReference);
        continue;
      }

      // const isValid = true; // 👈 临时跳过验签，本地测试强制通过

      if (notification.success !== "true") continue;

      const { eventCode, pspReference, amount } = notification;

      let saleorEventType: "CHARGE_SUCCESS" | "REFUND_SUCCESS" | "CANCEL_SUCCESS" | null = null;
      switch (eventCode) {
        case "AUTHORISATION": saleorEventType = "CHARGE_SUCCESS"; break;
        case "REFUND": saleorEventType = "REFUND_SUCCESS"; break;
        case "CANCELLATION": saleorEventType = "CANCEL_SUCCESS"; break;
      }

      if (!saleorEventType) continue;

      // 2. 从 DynamoDB 查出 transactionId 和 Saleor 凭据
      const transactionRecord = await getTransactionMapping(pspReference);
      if (!transactionRecord) {
        console.error(`❌ 找不到对应的 Saleor 交易: ${pspReference}`);
        continue;
      }

      // 3. 动态创建 GraphQL 客户端
      const client = createInstrumentedGraphqlClient({
        saleorApiUrl: transactionRecord.saleorApiUrl,
        token: transactionRecord.token,
      });

      try {
        // 4. 向 Saleor 报告状态
        await client.mutation(TransactionEventReportDocument, {
          transactionId: transactionRecord.transactionId,
          message: `Adyen async event: ${saleorEventType}`,
          pspReference,
          type: saleorEventType,
          amount: amount.value / 100, // 转回主单位
          time: new Date().toISOString(),
        }).toPromise();
        
        console.log(`✅ 成功通知 Saleor: ${saleorEventType} for ${transactionRecord.transactionId}`);
      } catch (error) {
        console.error("❌ 通知 Saleor 失败:", error);
      }
    }

    // 必须返回 [accepted] 纯文本
    return new Response("[accepted]", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("Adyen Webhook 解析错误:", error);
    return new Response("[accepted]", { status: 200 });
  }
}