// apps/adyen/src/app/api/webhooks/adyen/route.ts
import { hmacValidator } from "@adyen/api-library";
import { env } from "@/lib/env";
import { getTransactionMapping } from "@/modules/adyen/transaction-recorder"; // 👈 引入查库函数
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

      const hmacKey = env.ADYEN_HMAC_KEY || "";
      const isValid = validator.validateHMAC(notification as any, hmacKey);

      if (!isValid) {
        console.warn("⚠️ Adyen HMAC validation failed", notification.pspReference);
        continue;
      }

      if (notification.success !== "true") continue;

      const { eventCode, pspReference, amount } = notification;

      let saleorEventType: "CHARGE_SUCCESS" | "REFUND_SUCCESS" | "CANCEL_SUCCESS" | null = null;
      switch (eventCode) {
        case "AUTHORISATION": saleorEventType = "CHARGE_SUCCESS"; break;
        case "REFUND": saleorEventType = "REFUND_SUCCESS"; break;
        case "CANCELLATION": saleorEventType = "CANCEL_SUCCESS"; break;
      }

      if (!saleorEventType) continue;

      // 👇 核心 1：去 DynamoDB 查真实的 transactionId 和 Saleor 配置
      const transactionRecord = await getTransactionMapping(pspReference);
      if (!transactionRecord) {
        console.error(`❌ 找不到对应的 Saleor 交易: ${pspReference}`);
        continue;
      }

      // 👇 核心 2：动态使用对应 Saleor 实例的 API URL 和 Token
      const client = createInstrumentedGraphqlClient({
        saleorApiUrl: transactionRecord.saleorApiUrl,
        token: transactionRecord.token,
      });

      try {
        await client.mutation(TransactionEventReportDocument, {
          transactionId: transactionRecord.transactionId,
          message: `Adyen event: ${saleorEventType}`,
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

    return new Response("[accepted]", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("Adyen Webhook Error:", error);
    return new Response("[accepted]", { status: 200 });
  }
}