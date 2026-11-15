import { hmacValidator } from "@adyen/api-library";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validator = new hmacValidator();
    const notificationItems = body.notificationItems || [];

    for (const item of notificationItems) {
      const notification = item.NotificationRequestItem;
      if (!notification) continue;

      // 1. HMAC 验签 (注意：HMAC Key 应当从你的配置库中根据 merchantAccountCode 动态获取)
      // 这里为了演示，假设所有 Merchant Account 共用环境变量里的 Key
      const hmacKey = process.env.ADYEN_HMAC_KEY || ""; 
      const isValid = validator.validateHMAC(notification, hmacKey);

      if (!isValid) {
        console.warn("⚠️ Adyen HMAC validation failed", notification.pspReference);
        continue; // 验签失败直接跳过
      }

      // 2. 只处理成功的交易事件
      if (notification.success !== "true") continue;

      const { eventCode, pspReference, amount, merchantReference } = notification;

      // 3. 根据 eventCode 映射到 Saleor 的 transactionEventReport
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
        // 注意：CAPTURE 事件取决于你的 Adyen 账户是否开启了自动捕获
      }

      if (!saleorEventType) continue;

      // 4. 从数据库中反查 Saleor 的 transactionId (对应 Stripe 的 transactions-recording)
      // 如果还没实现反查逻辑，这里先 mock 一个
      const saleorTransactionId = await getTransactionIdByPspReference(pspReference);
      if (!saleorTransactionId) {
        console.error(`❌ 找不到对应的 Saleor 交易: ${pspReference}`);
        continue;
      }

      // 5. 调用 Saleor GraphQL 报告状态
      await reportToSaleor({
        transactionId: saleorTransactionId,
        pspReference,
        result: saleorEventType,
        // 注意：Adyen 的 amount.value 是最小单位，需要转回主单位
        amount: amount.value / 100, 
        currency: amount.currency,
      });
    }

    // ⚠️ Adyen 强制要求返回纯文本 [accepted] 和 HTTP 200
    return new Response("[accepted]", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("Adyen Webhook Error:", error);
    // 即便是 500，也建议返回 accepted 防止 Adyen 无限重试导致雪崩
    return new Response("[accepted]", { status: 200 });
  }
}

// --- 辅助函数 ---

async function getTransactionIdByPspReference(pspReference: string): Promise<string | null> {
  // TODO: 实现从 DynamoDB 根据 pspReference 查询 transactionId 的逻辑
  // 在 transaction-initialize-session 时，你应该把 { pspReference: link.id, transactionId: event.transaction.id } 存入数据库
  return "mock-transaction-id-123"; 
}

async function reportToSaleor(params: {
  transactionId: string;
  pspReference: string;
  result: string;
  amount: number;
  currency: string;
}) {
  const graphqlUrl = "http://localhost:8000/graphql/"; // 替换为你的 Saleor 地址
  const token = "YOUR_SALEOR_APP_TOKEN"; // 从配置库或 AuthData 获取

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
    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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

    const json = await response.json();
    if (json.errors || json.data?.transactionEventReport?.errors?.length > 0) {
      console.error("❌ Saleor 报告失败:", json);
    } else {
      console.log(`✅ Saleor 报告成功: ${params.result} for ${params.transactionId}`);
    }
  } catch (err) {
    console.error("❌ 请求 Saleor API 失败:", err);
  }
}