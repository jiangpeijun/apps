// apps/adyen/scripts/rotate-hmac-key.ts
/* eslint-disable no-console */
import { parseArgs } from "node:util";
import { DynamoDBClient, ScanCommand, UpdateItemCommand, ScanCommandOutput } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { env } from "../src/lib/env";

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "dry-run": { type: "boolean", default: false },
      "new-hmac-key": { type: "string", short: "k" },
    },
  });

  const isDryRun = values["dry-run"];
  const newHmacKey = values["new-hmac-key"];

  if (!newHmacKey) {
    console.error("❌ 请提供新的 HMAC 密钥: --new-hmac-key <YOUR_NEW_KEY>");
    process.exit(1);
  }

  console.log(`🚀 开始轮换 Adyen HMAC 密钥... (Dry Run: ${isDryRun})`);

  const client = new DynamoDBClient({
    region: env.AWS_REGION || "us-east-1",
    endpoint: env.AWS_ENDPOINT_URL,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID || "fakeMyKeyId",
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY || "fakeSecretAccessKey",
    },
  });

  const tableName = env.DYNAMODB_MAIN_TABLE_NAME;

  try {
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;
    let totalProcessed = 0;

    do {
      // 不要写 : any，直接 new ScanCommand
      const scanCommand = new ScanCommand({
        TableName: tableName,
        FilterExpression: "begins_with(PK, :pkPrefix)",
        ExpressionAttributeValues: marshall({
          ":pkPrefix": "ADYEN_CONFIG#",
        }),
        ExclusiveStartKey: lastEvaluatedKey,
      });

      // 👇 关键修复：显式声明 response 的类型为 ScanCommandOutput
      const response = await client.send(scanCommand) as ScanCommandOutput;
      const items = response.Items ? response.Items.map((item) => unmarshall(item)) : [];

      for (const item of items) {
        totalProcessed++;
        console.log(`- 处理配置: ${item.id || item.PK} ...`);

        if (!isDryRun) {
          const updateCommand = new UpdateItemCommand({
            TableName: tableName,
            Key: marshall({ PK: item.PK, SK: item.SK }),
            UpdateExpression: "SET hmacKeyEncrypted = :newKey, updatedAt = :now",
            ExpressionAttributeValues: marshall({
              ":newKey": newHmacKey,
              ":now": new Date().toISOString(),
            }),
          });
          await client.send(updateCommand);
          console.log(`  ✅ 更新成功`);
        } else {
          console.log(`  ⏭️ [Dry Run] 跳过实际写入`);
        }
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`🎉 HMAC 密钥轮换完成！共处理 ${totalProcessed} 条记录。`);
  } catch (error) {
    console.error("❌ 轮换过程中发生错误:", error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});