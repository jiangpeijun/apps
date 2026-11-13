import { Parser } from "dynamodb-toolbox";
import { describe, expect, it } from "vitest";

import { mockedConfigurationId, mockedSaleorAppId } from "@/__tests__/mocks/constants";
import { mockedAdyenPublishableKey } from "@/__tests__/mocks/mocked-adyen-publishable-key";
import { mockedAdyenRestrictedKeyTest } from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { mockAdyenWebhookSecret } from "@/__tests__/mocks/adyen-webhook-secret";

import { DynamoDbAdyenConfig } from "./adyen-config-db-model";

describe("DynamoDbAdyenConfig", () => {
  const saleorApiUrl = mockedSaleorApiUrl;
  const appId = mockedSaleorAppId;
  const configId = mockedConfigurationId;

  describe("accessPattern", () => {
    describe("getPK", () => {
      it("should return primary key scoped to installation", () => {
        const result = DynamoDbAdyenConfig.accessPattern.getPK({ saleorApiUrl, appId });

        expect(result).toBe(`${saleorApiUrl}#${appId}`);
      });
    });

    describe("getSKforSpecificItem", () => {
      it("should return sort key for specific config ID", () => {
        const result = DynamoDbAdyenConfig.accessPattern.getSKforSpecificItem({ configId });

        expect(result).toBe(`CONFIG_ID#${configId}`);
      });
    });

    describe("getSKforAllItems", () => {
      it("should return sort key prefix for all configs", () => {
        const result = DynamoDbAdyenConfig.accessPattern.getSKforAllItems();

        expect(result).toBe("CONFIG_ID#");
      });
    });
  });

  describe("schema", () => {
    it("Properly parses data and doesn't throw", () => {
      const schema = DynamoDbAdyenConfig.entitySchema;

      const result = schema.build(Parser).parse({
        PK: DynamoDbAdyenConfig.accessPattern.getPK({ saleorApiUrl, appId }),
        SK: DynamoDbAdyenConfig.accessPattern.getSKforSpecificItem({ configId }),
        configName: "name",
        configId: mockedConfigurationId,
        adyenPk: mockedAdyenPublishableKey,
        adyenRk: mockedAdyenRestrictedKeyTest,
        adyenWhSecret: mockAdyenWebhookSecret,
        adyenWhId: "wh_123456789",
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "PK": "https://foo.bar.saleor.cloud/graphql/#saleor-app-id",
          "SK": "CONFIG_ID#81f323bd-91e2-4838-ab6e-5affd81ffc3b",
          "configId": "81f323bd-91e2-4838-ab6e-5affd81ffc3b",
          "configName": "name",
          "adyenPk": "pk_live_1",
          "adyenRk": "rk_test_AAAAABBBBCCCCCEEEEEEEFFFFFGGGGG",
          "adyenWhId": "wh_123456789",
          "adyenWhSecret": "whsec_XYZ",
        }
      `);
    });
  });
});
