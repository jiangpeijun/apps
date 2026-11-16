// apps\apps\adyen\src\modules\app-config\repositories\dynamodb\adyen-config-db-model.ts
import { Entity, string } from "dynamodb-toolbox";
import { item } from "dynamodb-toolbox/schema/item";

import { DynamoMainTable, dynamoMainTable } from "@/modules/dynamodb/dynamo-main-table";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";

class AdyenConfigAccessPattern {
  static getPK({ saleorApiUrl, appId }: { saleorApiUrl: SaleorApiUrl; appId: string }) {
    return DynamoMainTable.getPrimaryKeyScopedToInstallation({ saleorApiUrl, appId });
  }

  static getSKforSpecificItem({ configId }: { configId: string }) {
    return `CONFIG_ID#${configId}` as const;
  }

  static getSKforAllItems() {
    return `CONFIG_ID#` as const;
  }
}

const DynamoDbAdyenConfigSchema = item({
  PK: string().key(),
  SK: string().key(),
  configName: string(),
  configId: string(),
  adyenPk: string(),
  adyenRk: string(),
  adyenWhSecret: string(),
  adyenWhId: string(),
});

const createAdyenConfigEntity = (table: DynamoMainTable) => {
  return new Entity({
    table,
    name: "AdyenConfig",
    schema: DynamoDbAdyenConfigSchema,
    timestamps: {
      created: {
        name: "createdAt",
        savedAs: "createdAt",
      },
      modified: {
        name: "modifiedAt",
        savedAs: "modifiedAt",
      },
    },
  });
};

const dynamoDbAdyenConfigEntity = createAdyenConfigEntity(dynamoMainTable);

export type DynamoDbAdyenConfigEntity = typeof dynamoDbAdyenConfigEntity;

export const DynamoDbAdyenConfig = {
  accessPattern: {
    getPK: AdyenConfigAccessPattern.getPK,
    getSKforSpecificItem: AdyenConfigAccessPattern.getSKforSpecificItem,
    getSKforAllItems: AdyenConfigAccessPattern.getSKforAllItems,
  },
  entitySchema: DynamoDbAdyenConfigSchema,
  createEntity: createAdyenConfigEntity,
  entity: dynamoDbAdyenConfigEntity,
};
