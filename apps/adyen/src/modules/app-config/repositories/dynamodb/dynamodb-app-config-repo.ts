// apps/adyen/src/modules/app-config/repositories/dynamodb/dynamodb-app-config-repo.ts
import { type IEncryptor } from "@saleor/apps-shared/encryptor";
import { RotatingEncryptor } from "@saleor/apps-shared/key-rotation/rotating-encryptor";
import {
  resolveDecryptFallbacks,
  resolveEncryptKey,
} from "@saleor/apps-shared/secret-key-resolution";
import { DeleteItemCommand, GetItemCommand, Parser, PutItemCommand } from "dynamodb-toolbox";
import { QueryCommand } from "dynamodb-toolbox/table/actions/query";
import { err, ok, type Result } from "neverthrow";

import { env } from "@/lib/env";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { AppRootConfig } from "@/modules/app-config/domain/app-root-config";
import { type AdyenConfig } from "@/modules/app-config/domain/adyen-config";
import {
  type AppConfigRepo,
  AppConfigRepoError,
  type BaseAccessPattern,
  type GetAdyenConfigAccessPattern,
  type AdyenConfigByChannelIdAccessPattern,
  type AdyenConfigByConfigIdAccessPattern,
} from "@/modules/app-config/repositories/app-config-repo";
import {
  DynamoDbChannelConfigMapping,
  type DynamoDbChannelConfigMappingEntity,
} from "@/modules/app-config/repositories/dynamodb/channel-config-mapping-db-model";
import {
  DynamoDbAdyenConfig,
  type DynamoDbAdyenConfigEntity,
} from "@/modules/app-config/repositories/dynamodb/adyen-config-db-model";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";

type ConstructorParams = {
  entities: {
    adyenConfig: DynamoDbAdyenConfigEntity;
    channelConfigMapping: DynamoDbChannelConfigMappingEntity;
  };
  encryptor: IEncryptor;
};

export class DynamodbAppConfigRepo implements AppConfigRepo {
  private logger = createLogger("DynamodbAppConfigRepo");

  adyenConfigEntity: DynamoDbAdyenConfigEntity;
  channelConfigMappingEntity: DynamoDbChannelConfigMappingEntity;
  encryptor: IEncryptor;

  constructor(
    config: ConstructorParams = {
      entities: {
        adyenConfig: DynamoDbAdyenConfig.entity,
        channelConfigMapping: DynamoDbChannelConfigMapping.entity,
      },
      encryptor: new RotatingEncryptor({
        primarySecret: resolveEncryptKey(env),
        fallbackSecrets: resolveDecryptFallbacks(env),
        logger: createLogger("RotatingEncryptor"),
      }),
    },
  ) {
    this.channelConfigMappingEntity = config.entities.channelConfigMapping;
    this.adyenConfigEntity = config.entities.adyenConfig;
    this.encryptor = config.encryptor;
  }

  async getRootConfig(
    access: BaseAccessPattern,
  ): Promise<Result<AppRootConfig, InstanceType<typeof BaseError>>> {
    const allConfigsQuery = this.adyenConfigEntity.table
      .build(QueryCommand)
      .entities(this.adyenConfigEntity)
      .query({
        range: {
          beginsWith: DynamoDbAdyenConfig.accessPattern.getSKforAllItems(),
        },
        partition: DynamoDbAdyenConfig.accessPattern.getPK({
          appId: access.appId,
          saleorApiUrl: access.saleorApiUrl,
        }),
      })
      .options({ maxPages: Infinity });

    const allMappingsQuery = this.channelConfigMappingEntity.table
      .build(QueryCommand)
      .entities(this.channelConfigMappingEntity)
      .query({
        range: {
          beginsWith: DynamoDbChannelConfigMapping.accessPattern.getSKforAllChannels(),
        },
        partition: DynamoDbChannelConfigMapping.accessPattern.getPK({
          appId: access.appId,
          saleorApiUrl: access.saleorApiUrl,
        }),
      })
      .options({ maxPages: Infinity });

    try {
      const results = await Promise.all([allConfigsQuery, allMappingsQuery].map((q) => q.send()));

      const [configs, mappings] = results;

      const parsedConfigs =
        configs.Items?.map((item) => {
          return DynamoDbAdyenConfig.entitySchema.build(Parser).parse(item);
        }) ?? [];

      const parsedMappings =
        mappings.Items?.map((item) => {
          return DynamoDbChannelConfigMapping.entitySchema.build(Parser).parse(item);
        }) ?? [];

      const rootConfig = new AppRootConfig(
        parsedMappings.reduce(
          (record, dynamoItem) => {
            if (dynamoItem.configId) {
              record[dynamoItem.channelId] = dynamoItem.configId;
            }
            return record;
          },
          {} as Record<string, string>,
        ),
        parsedConfigs.reduce(
          (record, dynamoItem) => {
            record[dynamoItem.configId] = {
              id: dynamoItem.configId,
              name: dynamoItem.configName,
              merchantAccount: dynamoItem.adyenWhId || "",
              clientKey: dynamoItem.adyenPk || "",
              environment: dynamoItem.adyenPk?.startsWith("live_") ? "live" : "test",
              apiKeyEncrypted: dynamoItem.adyenRk || "",
              hmacKeyEncrypted: dynamoItem.adyenWhSecret || "",
              storefrontUrl: "",
              channelSlugs: [],
              saleorApiUrl: access.saleorApiUrl,
              token: "",
            };
            return record;
          },
          {} as Record<string, AdyenConfig>,
        ),
      );

      return ok(rootConfig);
    } catch (e) {
      this.logger.error("Failed to fetch RootConfig from DynamoDB", { cause: e });
      return err(
        new AppConfigRepoError.FailureFetchingConfig("Error fetching RootConfig from DynamoDB", {
          cause: e,
        }),
      );
    }
  }

  private fetchAdyenConfigByItsId(access: AdyenConfigByConfigIdAccessPattern) {
    const query = this.adyenConfigEntity.build(GetItemCommand).key({
      PK: DynamoDbAdyenConfig.accessPattern.getPK(access),
      SK: DynamoDbAdyenConfig.accessPattern.getSKforSpecificItem({
        configId: access.configId,
      }),
    });
    return query.send();
  }

  private fetchConfigIdFromChannelId(access: AdyenConfigByChannelIdAccessPattern) {
    const query = this.channelConfigMappingEntity.build(GetItemCommand).key({
      PK: DynamoDbChannelConfigMapping.accessPattern.getPK(access),
      SK: DynamoDbChannelConfigMapping.accessPattern.getSKforSpecificChannel({
        channelId: access.channelId,
      }),
    });
    return query.send();
  }

    private mapRawDynamoConfigItemToConfigOrThrow(item: unknown): AdyenConfig {
    const parsed = DynamoDbAdyenConfig.entitySchema.build(Parser).parse(item);

    // 加上安全默认值，防止旧数据或者空字符串导致 startsWith 崩溃
    const clientKey = parsed.adyenPk || "";
    const adyenRk = parsed.adyenRk || "";
    const adyenWhSecret = parsed.adyenWhSecret || "";

    return {
      id: parsed.configId,
      name: parsed.configName,
      merchantAccount: parsed.adyenWhId || "",
      apiKeyEncrypted: adyenRk ? this.encryptor.decrypt(adyenRk) : "",
      hmacKeyEncrypted: adyenWhSecret ? this.encryptor.decrypt(adyenWhSecret) : "",
      clientKey: clientKey,
      environment: clientKey.startsWith("live_") ? "live" : "test",
      storefrontUrl: process.env.APP_IFRAME_BASE_URL || "",
      channelSlugs: [],
      saleorApiUrl: "",
      token: "",
    };
  }

  async getAdyenConfig(
    access: GetAdyenConfigAccessPattern,
  ): Promise<Result<AdyenConfig | null, InstanceType<typeof BaseError>>> {
    const channelId = "channelId" in access ? access.channelId : undefined;
    let configId = "configId" in access ? access.configId : undefined;

    if (!configId && channelId) {
      try {
        const configIdResult = await this.fetchConfigIdFromChannelId({
          appId: access.appId,
          saleorApiUrl: access.saleorApiUrl,
          channelId: channelId,
        });

        if (!configIdResult.Item) {
          return ok(null);
        }

        const parsed = DynamoDbChannelConfigMapping.entitySchema
          .build(Parser)
          .parse(configIdResult.Item);

        configId = parsed.configId;
      } catch (e) {
        return err(
          new AppConfigRepoError.FailureFetchingConfig(
            "Error fetching specific config from DynamoDB",
            { cause: e },
          ),
        );
      }
    }

    if (!configId) {
      return ok(null);
    }

    try {
      const result = await this.fetchAdyenConfigByItsId({
        configId,
        appId: access.appId,
        saleorApiUrl: access.saleorApiUrl,
      });

      if (!result.Item) {
        return ok(null);
      }

      const parsedConfig = this.mapRawDynamoConfigItemToConfigOrThrow(result.Item);
      return ok(parsedConfig);
    } catch (e) {
      this.logger.error("Failed to fetch config from DynamoDB", { cause: e });
      return err(
        new AppConfigRepoError.FailureFetchingConfig(
          "Error fetching specific config from DynamoDB",
          { cause: e },
        ),
      );
    }
  }

  async saveAdyenConfig({
    config,
    appId,
    saleorApiUrl,
  }: {
    config: AdyenConfig;
    saleorApiUrl: SaleorApiUrl;
    appId: string;
  }): Promise<Result<void | null, InstanceType<typeof AppConfigRepoError.FailureSavingConfig>>> {
    try {
      const command = this.adyenConfigEntity.build(PutItemCommand).item({
        configId: config.id,
        adyenPk: config.clientKey, // 映射 clientKey
        adyenRk: this.encryptor.encrypt(config.apiKeyEncrypted), // 映射加密 apiKey
        adyenWhId: config.merchantAccount, // 映射 merchantAccount
        adyenWhSecret: this.encryptor.encrypt(config.hmacKeyEncrypted), // 映射加密 hmacKey
        PK: DynamoDbAdyenConfig.accessPattern.getPK({ saleorApiUrl, appId }),
        SK: DynamoDbAdyenConfig.accessPattern.getSKforSpecificItem({ configId: config.id }),
        configName: config.name,
      });

      const response = await command.send();

      this.logger.info("Saved config to DynamoDB", {
        dynamoHttpResponseStatusCode: response.$metadata.httpStatusCode,
        configId: config.id,
      });

      return ok(null);
    } catch (e) {
      this.logger.error("Failed to save config to DynamoDB", { cause: e });
      return err(
        new AppConfigRepoError.FailureSavingConfig("Failed to save config to DynamoDB", {
          cause: e,
        }),
      );
    }
  }

  async updateMapping(
    access: BaseAccessPattern,
    data: {
      configId: string | null;
      channelId: string;
    },
  ): Promise<Result<void | null, InstanceType<typeof BaseError>>> {
    const command = this.channelConfigMappingEntity.build(PutItemCommand).item({
      configId: data.configId ?? undefined,
      channelId: data.channelId,
      PK: DynamoDbChannelConfigMapping.accessPattern.getPK(access),
      SK: DynamoDbChannelConfigMapping.accessPattern.getSKforSpecificChannel({
        channelId: data.channelId,
      }),
    });

    try {
      const result = await command.send();
      this.logger.info("Updated mapping in DynamoDB", {
        dynamoHttpResponseStatusCode: result.$metadata.httpStatusCode,
        configId: data.configId,
        channelId: data.channelId,
      });
      return ok(null);
    } catch (e) {
      this.logger.error("Failed to update mapping in DynamoDB", { error: e });
      return err(
        new AppConfigRepoError.FailureSavingConfig("Failed to update mapping in DynamoDB", {
          cause: e,
        }),
      );
    }
  }

  async removeConfig(
    access: BaseAccessPattern,
    data: {
      configId: string;
    },
  ): Promise<Result<null, InstanceType<typeof AppConfigRepoError.FailureRemovingConfig>>> {
    try {
      const operation = this.adyenConfigEntity.build(DeleteItemCommand).key({
        PK: DynamoDbAdyenConfig.accessPattern.getPK(access),
        SK: DynamoDbAdyenConfig.accessPattern.getSKforSpecificItem({
          configId: data.configId,
        }),
      });

      const result = await operation.send();

      if (result.$metadata.httpStatusCode !== 200) {
        return err(
          new AppConfigRepoError.FailureRemovingConfig("Failed to remove config from DynamoDB", {
            props: {
              dynamoHttpResponseStatusCode: result.$metadata.httpStatusCode,
            },
          }),
        );
      }

      return ok(null);
    } catch (e) {
      return err(
        new AppConfigRepoError.FailureRemovingConfig("Failed to remove config from DynamoDB", {
          cause: e,
        }),
      );
    }
  }
}