import { DynamoAPL } from "@saleor/app-sdk/APL/dynamodb";
import { Encryptor } from "@saleor/apps-shared/encryptor";
import { testApiHandler } from "next-test-api-route-handler";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { paymentGatewayInitializeFixture } from "@/__tests__/integration/webhooks/fixtures/payment-gateway-initialize-fixture";
import { mockedSaleorAppId, mockedSaleorChannelId } from "@/__tests__/mocks/constants";
import { mockedAdyenPublishableKey } from "@/__tests__/mocks/mocked-adyen-publishable-key";
import { mockedAdyenRestrictedKey } from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { mockAdyenWebhookSecret } from "@/__tests__/mocks/adyen-webhook-secret";
import * as paymentGatewayInitializeSessionHandlers from "@/app/api/webhooks/saleor/payment-gateway-initialize-session/route";
import * as verifyWebhookSignatureModule from "@/app/api/webhooks/saleor/verify-signature";
import { RandomId } from "@/lib/random-id";
import { AdyenConfig } from "@/modules/app-config/domain/adyen-config";
import { DynamoDbChannelConfigMapping } from "@/modules/app-config/repositories/dynamodb/channel-config-mapping-db-model";
import { DynamodbAppConfigRepo } from "@/modules/app-config/repositories/dynamodb/dynamodb-app-config-repo";
import { DynamoDbAdyenConfig } from "@/modules/app-config/repositories/dynamodb/adyen-config-db-model";
import { dynamoMainTable } from "@/modules/dynamodb/dynamo-main-table";
import { createSaleorApiUrl } from "@/modules/saleor/saleor-api-url";

import { env } from "../env";

const realSaleorApiUrl = createSaleorApiUrl(env.INTEGRATION_SALEOR_API_URL)._unsafeUnwrap();

const configId = new RandomId().generate();

const repo = new DynamodbAppConfigRepo({
  entities: {
    channelConfigMapping: DynamoDbChannelConfigMapping.entity,
    adyenConfig: DynamoDbAdyenConfig.entity,
  },
  encryptor: new Encryptor(env.SECRET_KEY),
});

const apl = DynamoAPL.create({
  table: dynamoMainTable,
});

describe("PaymentGatewayInitialize webhook: integration", async () => {
  beforeEach(async () => {
    vi.spyOn(verifyWebhookSignatureModule, "verifyWebhookSignature").mockImplementation(
      async () => {},
    );

    await apl.set({
      saleorApiUrl: realSaleorApiUrl,
      appId: mockedSaleorAppId,
      token: "mocked-token",
      jwks: "{}",
    });

    await repo.saveAdyenConfig({
      saleorApiUrl: realSaleorApiUrl,
      appId: mockedSaleorAppId,
      config: AdyenConfig.create({
        publishableKey: mockedAdyenPublishableKey,
        name: "Config name",
        webhookId: "we_123",
        restrictedKey: mockedAdyenRestrictedKey,
        webhookSecret: mockAdyenWebhookSecret,
        id: configId,
      })._unsafeUnwrap(),
    });

    await repo.updateMapping(
      {
        saleorApiUrl: realSaleorApiUrl,
        appId: mockedSaleorAppId,
      },
      {
        configId: configId,
        channelId: mockedSaleorChannelId,
      },
    );
  });

  it("Returns response with stored publishable key from the config", async () => {
    await testApiHandler({
      appHandler: paymentGatewayInitializeSessionHandlers,
      async test({ fetch }) {
        const response = await fetch({
          method: "POST",
          body: JSON.stringify(paymentGatewayInitializeFixture()),
          headers: new Headers({
            "saleor-api-url": realSaleorApiUrl,
            "saleor-event": "payment_gateway_initialize_session",
            "saleor-signature": "mock-signature",
          }),
        });

        const body = await response.json();

        expect(body).toStrictEqual({ data: { adyenPublishableKey: "pk_live_1" } });

        expect(response.status).toStrictEqual(200);
      },
    });
  });
});
