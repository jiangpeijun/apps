import { SaleorGraphQLClient } from "@/lib/graphql-client";
import { TransactionEventReportDocument } from "@/generated/graphql";
import { withTimeout, SALEOR_TIMEOUT_MS } from "./adyen-timeout";

export async function reportAdyenEventToSaleor(params: {
  pspReference: string;
  result: "CHARGE_SUCCESS" | "REFUND_SUCCESS" | "CANCEL_SUCCESS";
  amount: number;
  eventDate: string;
  config: { saleorApiUrl: string; token: string };
}) {
  const client = new SaleorGraphQLClient(
    params.config.saleorApiUrl,
    params.config.token
  );

  // 从 DynamoDB 按 pspReference 反查 transactionId（复用 Stripe 的 transactions-recording 模式）
  // const transactionId = await findTransactionIdByPspReference(params.pspReference);

  try {
    await withTimeout(
      client.mutate({
        mutation: TransactionEventReportDocument,
        variables: {
          // transactionId,
          pspReference: params.pspReference,
          type: params.result,
          amount: params.amount,
          time: params.eventDate,
        },
      }),
      SALEOR_TIMEOUT_MS,
      "Saleor transactionEventReport"
    );
  } catch (error) {
    console.error("Failed to report event to Saleor", error);
  }
}