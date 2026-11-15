// apps/adyen/src/modules/adyen/transaction-recorder.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { env } from "@/lib/env";

// 初始化 DynamoDB 客户端 (复用你在 rotate-hmac-key 里配的环境变量)
const client = new DynamoDBClient({
  region: env.AWS_REGION || "us-east-1",
  endpoint: env.AWS_ENDPOINT_URL,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID || "fakeMyKeyId",
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY || "fakeSecretAccessKey",
  },
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = env.DYNAMODB_MAIN_TABLE_NAME;

export type TransactionMapping = {
  pspReference: string;
  transactionId: string;
  saleorApiUrl: string;
  token: string;
};

/**
 * 在发起支付时保存映射
 */
export async function saveTransactionMapping(data: TransactionMapping) {
  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `PSP#${data.pspReference}`,
      SK: `TRANSACTION`,
      ...data,
    },
  });
  await docClient.send(command);
}

/**
 * 在 Adyen 异步回调时查询映射
 */
export async function getTransactionMapping(pspReference: string): Promise<TransactionMapping | null> {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `PSP#${pspReference}`,
      SK: `TRANSACTION`,
    },
  });
  const result = await docClient.send(command);
  return result.Item ? (result.Item as TransactionMapping) : null;
}