// apps/adyen/src/modules/adyen/report-adyen-event-to-saleor.ts
import { createInstrumentedGraphqlClient } from "@/lib/graphql-client";
import { TransactionEventReportDocument } from "@/generated/graphql";
import { withTimeout, SALEOR_TIMEOUT_MS } from "./adyen-timeout";

export async function reportAdyenEventToSaleor(params: {
  pspReference: string;
  result: "CHARGE_SUCCESS" | "REFUND_SUCCESS" | "CANCEL_SUCCESS";
  amount: number;
  eventDate: string;
  config: { saleorApiUrl: string; token: string };
}) {
  // 👇 修复：使用正确的参数名 saleorApiUrl 和 token
  const client = createInstrumentedGraphqlClient({
    saleorApiUrl: params.config.saleorApiUrl, 
    token: params.config.token, 
  });

  // 从 DynamoDB 按 pspReference 反查 transactionId
  const transactionId = await getTransactionIdByPspReference(params.pspReference);
  
  if (!transactionId) {
    console.error(`❌ 找不到对应的 Saleor 交易: ${params.pspReference}`);
    return;
  }

  try {
    // 👇 使用 urql 的 mutation 语法
    await withTimeout(
      client.mutation(TransactionEventReportDocument, {
        transactionId,
        message: `Adyen event: ${params.result}`, 
        pspReference: params.pspReference,
        type: params.result,
        amount: params.amount,
        time: params.eventDate,
      }).toPromise(), 
      SALEOR_TIMEOUT_MS,
      "Saleor transactionEventReport"
    );
  } catch (error) {
    console.error("Failed to report event to Saleor", error);
  }
}

// 模拟查库函数
async function getTransactionIdByPspReference(pspReference: string): Promise<string | null> {
  // TODO: 在 transaction-initialize-session 时，把 { pspReference, transactionId } 存入 DynamoDB
  return "mock-transaction-id-123";
}