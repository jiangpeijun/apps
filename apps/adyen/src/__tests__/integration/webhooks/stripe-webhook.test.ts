import { DynamoAPL } from "@saleor/app-sdk/APL/dynamodb";
import { Encryptor } from "@saleor/apps-shared/encryptor";
import { testApiHandler } from "next-test-api-route-handler";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockedSaleorAppId,
  mockedSaleorChannelId,
  mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
  mockedSaleorTransactionId,
} from "@/__tests__/mocks/constants";
import { mockAdyenWebhookSecret } from "@/__tests__/mocks/adyen-webhook-secret";
import * as adyenWebhookHandlers from "@/app/api/webhooks/adyen/route";
import { WebhookParams } from "@/app/api/webhooks/adyen/webhook-params";
import { RandomId } from "@/lib/random-id";
import { AdyenConfig } from "@/modules/app-config/domain/adyen-config";
import { DynamoDbChannelConfigMapping } from "@/modules/app-config/repositories/dynamodb/channel-config-mapping-db-model";
import { DynamodbAppConfigRepo } from "@/modules/app-config/repositories/dynamodb/dynamodb-app-config-repo";
import { DynamoDbAdyenConfig } from "@/modules/app-config/repositories/dynamodb/adyen-config-db-model";
import { dynamoMainTable } from "@/modules/dynamodb/dynamo-main-table";
import { createResolvedTransactionFlow } from "@/modules/resolved-transaction-flow";
import { createSaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { createSaleorTransactionFlow } from "@/modules/saleor/saleor-transaction-flow";
import { AdyenClient } from "@/modules/adyen/adyen-client";
import { AdyenMoney } from "@/modules/adyen/adyen-money";
import {
  createAdyenPaymentIntentId,
  type AdyenPaymentIntentId,
} from "@/modules/adyen/adyen-payment-intent-id";
import { AdyenPaymentIntentsApiFactory } from "@/modules/adyen/adyen-payment-intents-api-factory";
import { createAdyenPublishableKey } from "@/modules/adyen/adyen-publishable-key";
import { createAdyenRefundId } from "@/modules/adyen/adyen-refund-id";
import { AdyenRefundsApiFactory } from "@/modules/adyen/adyen-refunds-api-factory";
import { createAdyenRestrictedKey } from "@/modules/adyen/adyen-restricted-key";
import { AdyenWebhookUrlBuilder } from "@/modules/adyen/adyen-webhook-url-builder";
import { RecordedTransaction } from "@/modules/transactions-recording/domain/recorded-transaction";
import { DynamoDBTransactionRecorderRepo } from "@/modules/transactions-recording/repositories/dynamodb/dynamodb-transaction-recorder-repo";
import { DynamoDbRecordedTransaction } from "@/modules/transactions-recording/repositories/dynamodb/recorded-transaction-db-model";

import { env } from "../env";
import { mswServer } from "../msw-server";
import { chargeRefundUpdatedEventFixture } from "./fixtures/charge-refund-updated-event-fixture";
import { paymentIntentSucceededEventFixture } from "./fixtures/payment-intent-succeeded-event-fixture";

const realSaleorApiUrl = createSaleorApiUrl(env.INTEGRATION_SALEOR_API_URL)._unsafeUnwrap();

const configId = new RandomId().generate();

const configRepo = new DynamodbAppConfigRepo({
  entities: {
    channelConfigMapping: DynamoDbChannelConfigMapping.entity,
    adyenConfig: DynamoDbAdyenConfig.entity,
  },
  encryptor: new Encryptor(env.SECRET_KEY),
});

const transactionRecorderRepo = new DynamoDBTransactionRecorderRepo({
  entity: DynamoDbRecordedTransaction.entity,
});

const apl = DynamoAPL.create({
  table: dynamoMainTable,
});

const restrictedKey = createAdyenRestrictedKey(env.INTEGRATION_ADYEN_RK)._unsafeUnwrap();

const paymentIntentApi = new AdyenPaymentIntentsApiFactory().create({
  key: restrictedKey,
});

const refundApi = new AdyenRefundsApiFactory().create({
  key: restrictedKey,
});

const adyenMoney = AdyenMoney.createFromSaleorAmount({
  amount: 123.33,
  currency: "USD",
})._unsafeUnwrap();

let adyenPaymentIntentId: AdyenPaymentIntentId;

const saleorRequestVarsSpy = vi.fn();

const urlBuilder = new AdyenWebhookUrlBuilder();

describe("Adyen Webhook: integration", () => {
  beforeAll(() =>
    mswServer.listen({
      onUnhandledRequest: (request, print) => {
        if (request.url.includes(env.AWS_ENDPOINT_URL)) {
          return; // Do not print warnings for DynamoDB local
        }
        if (request.url.includes("adyen.com")) {
          return; // Do not print warnings for Adyen API - we use real Adyen API in these tests
        }
        print.warning();
      },
    }),
  );
  afterAll(() => mswServer.close());
  afterEach(() => mswServer.resetHandlers());

  beforeEach(async () => {
    await apl.set({
      saleorApiUrl: realSaleorApiUrl,
      appId: mockedSaleorAppId,
      token: "mocked-token",
      jwks: "{}",
    });

    await configRepo.saveAdyenConfig({
      saleorApiUrl: realSaleorApiUrl,
      appId: mockedSaleorAppId,
      config: AdyenConfig.create({
        publishableKey: createAdyenPublishableKey(env.INTEGRATION_ADYEN_PK)._unsafeUnwrap(),
        name: "Config name",
        webhookId: "we_123",
        restrictedKey,
        webhookSecret: mockAdyenWebhookSecret,
        id: configId,
      })._unsafeUnwrap(),
    });

    await configRepo.updateMapping(
      {
        saleorApiUrl: realSaleorApiUrl,
        appId: mockedSaleorAppId,
      },
      {
        configId: configId,
        channelId: mockedSaleorChannelId,
      },
    );

    const paymentIntentResult = await paymentIntentApi.createPaymentIntent({
      adyenMoney,
      idempotencyKey: new RandomId().generate(),
      intentParams: {
        return_url: "https://saleor-adyen-integration-test.com",
        automatic_payment_methods: {
          enabled: true,
        },
        payment_method: "pm_card_visa",
        confirm: true,
      },
    });

    adyenPaymentIntentId = createAdyenPaymentIntentId(paymentIntentResult._unsafeUnwrap().id);

    await transactionRecorderRepo.recordTransaction(
      {
        saleorApiUrl: realSaleorApiUrl,
        appId: mockedSaleorAppId,
      },
      new RecordedTransaction({
        saleorTransactionId: mockedSaleorTransactionId,
        adyenPaymentIntentId,
        saleorTransactionFlow: createSaleorTransactionFlow("CHARGE"),
        resolvedTransactionFlow: createResolvedTransactionFlow("CHARGE"),
        selectedPaymentMethod: "card",
        saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      }),
    );

    mswServer.events.on("response:mocked", async ({ request }) => {
      const clonedRequest = request.clone();
      const requestJSON = await clonedRequest.json();

      saleorRequestVarsSpy(requestJSON);
    });
  });

  it("should successfully process a payment intent event", async () => {
    const payload = paymentIntentSucceededEventFixture(adyenPaymentIntentId);

    const payloadString = JSON.stringify(payload, null, 2);

    const adyenClient = AdyenClient.createFromRestrictedKey(restrictedKey);

    const header = adyenClient.nativeClient.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: mockAdyenWebhookSecret,
    });

    const webhookUrl = urlBuilder.buildUrl({
      appUrl: "https://adyen-v2.saleor.app/api/webhooks/adyen",
      webhookParams: WebhookParams.createFromParams({
        configurationId: configId,
        saleorApiUrl: realSaleorApiUrl,
        appId: mockedSaleorAppId,
      }),
    });

    await testApiHandler({
      appHandler: adyenWebhookHandlers,
      url: webhookUrl._unsafeUnwrap().toString(),
      async test({ fetch }) {
        const response = await fetch({
          method: "POST",
          body: payloadString,
          headers: new Headers({
            "adyen-signature": header,
          }),
        });

        const body = await response.text();

        expect(body).toStrictEqual("Ok");

        const requestSpyData = saleorRequestVarsSpy.mock.calls[0][0];

        expect(requestSpyData.variables).toStrictEqual({
          amount: 1.013,
          availableActions: ["REFUND"],
          externalUrl: expect.stringContaining(adyenPaymentIntentId),
          message: "Payment intent has been successful",
          pspReference: adyenPaymentIntentId,
          time: expect.any(String),
          transactionId: mockedSaleorTransactionId,
          type: "CHARGE_SUCCESS",
          paymentMethodDetails: {
            card: {
              brand: "visa",
              name: "visa",
              expMonth: expect.any(Number),
              expYear: expect.any(Number),
              lastDigits: "4242",
            },
          },
        });
      },
    });
  });

  it("should successfully process a charge refund updated event", async () => {
    const adyenRefund = await refundApi.createRefund({
      paymentIntentId: adyenPaymentIntentId,
      adyenMoney,
      idempotencyKey: new RandomId().generate(),
    });

    const adyenRefundId = createAdyenRefundId(adyenRefund._unsafeUnwrap().id);

    const payload = chargeRefundUpdatedEventFixture(adyenRefundId, adyenPaymentIntentId);

    const payloadString = JSON.stringify(payload, null, 2);

    const adyenClient = AdyenClient.createFromRestrictedKey(restrictedKey);

    const header = adyenClient.nativeClient.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: mockAdyenWebhookSecret,
    });

    const webhookUrl = urlBuilder.buildUrl({
      appUrl: "https://adyen-v2.saleor.app/api/webhooks/adyen",
      webhookParams: WebhookParams.createFromParams({
        configurationId: configId,
        saleorApiUrl: realSaleorApiUrl,
        appId: mockedSaleorAppId,
      }),
    });

    await testApiHandler({
      appHandler: adyenWebhookHandlers,
      url: webhookUrl._unsafeUnwrap().toString(),
      async test({ fetch }) {
        const response = await fetch({
          method: "POST",
          body: payloadString,
          headers: new Headers({
            "adyen-signature": header,
          }),
        });

        const body = await response.text();

        expect(body).toStrictEqual("Ok");

        const requestSpyData = saleorRequestVarsSpy.mock.calls[0][0];

        expect(requestSpyData.variables).toStrictEqual({
          amount: 10,
          availableActions: ["REFUND"],
          externalUrl: expect.stringContaining(adyenRefundId),
          message: "Refund was successful",
          pspReference: adyenRefundId,
          time: expect.any(String),
          transactionId: mockedSaleorTransactionId,
          type: "REFUND_SUCCESS",
          paymentMethodDetails: null,
        });
      },
    });
  });
});
