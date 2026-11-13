import { DynamoAPL } from "@saleor/app-sdk/APL/dynamodb";
import { Encryptor } from "@saleor/apps-shared/encryptor";
import { testApiHandler } from "next-test-api-route-handler";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockedSaleorAppId,
  mockedSaleorChannelId,
  mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
  mockedSaleorTransactionId,
} from "@/__tests__/mocks/constants";
import { mockAdyenWebhookSecret } from "@/__tests__/mocks/adyen-webhook-secret";
import * as transactionRefundRequested from "@/app/api/webhooks/saleor/transaction-refund-requested/route";
import * as verifyWebhookSignatureModule from "@/app/api/webhooks/saleor/verify-signature";
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
import { createAdyenRestrictedKey } from "@/modules/adyen/adyen-restricted-key";
import { RecordedTransaction } from "@/modules/transactions-recording/domain/recorded-transaction";
import { DynamoDBTransactionRecorderRepo } from "@/modules/transactions-recording/repositories/dynamodb/dynamodb-transaction-recorder-repo";
import { DynamoDbRecordedTransaction } from "@/modules/transactions-recording/repositories/dynamodb/recorded-transaction-db-model";

import { env } from "../env";
import { transactionRefundRequestedFixture } from "./fixtures/transaction-refund-requested-fixture";

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

const adyenMoney = AdyenMoney.createFromSaleorAmount({
  amount: 123.33,
  currency: "USD",
})._unsafeUnwrap();

const adyenClient = AdyenClient.createFromRestrictedKey(restrictedKey).nativeClient;

/**
 * Creates a real, charged Adyen Payment Intent and records it, so the refund webhook can act on it
 */
const createChargedPaymentIntent = async () => {
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

  const adyenPaymentIntentId = createAdyenPaymentIntentId(paymentIntentResult._unsafeUnwrap().id);

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

  return adyenPaymentIntentId;
};

const postRefundRequest = async (args: {
  adyenPaymentIntentId: AdyenPaymentIntentId;
  idempotencyKey: string;
  amount?: number;
}) => {
  let body: { pspReference: string };

  await testApiHandler({
    appHandler: transactionRefundRequested,
    async test({ fetch }) {
      const response = await fetch({
        method: "POST",
        body: JSON.stringify(transactionRefundRequestedFixture(args)),
        headers: new Headers({
          "saleor-api-url": realSaleorApiUrl,
          "saleor-event": "transaction_refund_requested",
          "saleor-signature": "mock-signature",
        }),
      });

      expect(response.status).toStrictEqual(200);

      body = await response.json();
    },
  });

  return body!;
};

describe("TransactionRefundRequested webhook: integration", async () => {
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
  });

  it("Returns response with pspReference of the Adyen refund (Saleor async flow)", async () => {
    const adyenPaymentIntentId = await createChargedPaymentIntent();

    const body = await postRefundRequest({
      adyenPaymentIntentId,
      idempotencyKey: new RandomId().generate(),
    });

    expect(body).toStrictEqual({
      pspReference: expect.stringContaining("re_"),
    });
  });

  it("Creates only one Adyen refund when Saleor redelivers the same refund request", async () => {
    const adyenPaymentIntentId = await createChargedPaymentIntent();
    // Saleor reuses the key of the request event on every delivery retry
    const idempotencyKey = new RandomId().generate();

    const firstBody = await postRefundRequest({ adyenPaymentIntentId, idempotencyKey });
    const secondBody = await postRefundRequest({ adyenPaymentIntentId, idempotencyKey });

    expect(secondBody.pspReference).toStrictEqual(firstBody.pspReference);

    const refunds = await adyenClient.refunds.list({
      payment_intent: adyenPaymentIntentId,
    });

    expect(refunds.data).toHaveLength(1);
  });

  it("Creates two Adyen refunds for two distinct refund requests of the same amount", async () => {
    const adyenPaymentIntentId = await createChargedPaymentIntent();
    const amount = 10;

    const firstBody = await postRefundRequest({
      adyenPaymentIntentId,
      idempotencyKey: new RandomId().generate(),
      amount,
    });
    const secondBody = await postRefundRequest({
      adyenPaymentIntentId,
      idempotencyKey: new RandomId().generate(),
      amount,
    });

    expect(secondBody.pspReference).not.toStrictEqual(firstBody.pspReference);

    const refunds = await adyenClient.refunds.list({
      payment_intent: adyenPaymentIntentId,
    });

    expect(refunds.data).toHaveLength(2);
  });
});
