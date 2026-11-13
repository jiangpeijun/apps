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
import * as cancelationRequestedHandlers from "@/app/api/webhooks/saleor/transaction-cancelation-requested/route";
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
import { transactionCancelationRequestedFixture } from "./fixtures/transaction-cancelation-requested-fixture";

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

let adyenPaymentIntentId: AdyenPaymentIntentId;

describe("TransactionCancellationRequested webhook: integration", async () => {
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

    const paymentIntentResult = await paymentIntentApi.createPaymentIntent({
      adyenMoney: AdyenMoney.createFromSaleorAmount({
        amount: 123.33,
        currency: "USD",
      })._unsafeUnwrap(),
      idempotencyKey: new RandomId().generate(),
      intentParams: {
        automatic_payment_methods: {
          enabled: true,
        },
        payment_method_options: {
          card: {
            capture_method: "manual",
          },
        },
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
        saleorTransactionFlow: createSaleorTransactionFlow("AUTHORIZATION"),
        resolvedTransactionFlow: createResolvedTransactionFlow("AUTHORIZATION"),
        selectedPaymentMethod: "card",
        saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
      }),
    );
  });

  it("Returns response with CANCEL_SUCCESS", async () => {
    await testApiHandler({
      appHandler: cancelationRequestedHandlers,
      async test({ fetch }) {
        const response = await fetch({
          method: "POST",
          body: JSON.stringify(transactionCancelationRequestedFixture(adyenPaymentIntentId)),
          headers: new Headers({
            "saleor-api-url": realSaleorApiUrl,
            "saleor-event": "transaction_cancelation_requested",
            "saleor-signature": "mock-signature",
          }),
        });

        const body = await response.json();

        expect(body).toStrictEqual({
          result: "CANCEL_SUCCESS",
          amount: 123.33,
          actions: [],
          pspReference: expect.stringContaining("pi_"),
          message: "Payment intent was cancelled",
          externalUrl: expect.stringContaining("https://dashboard.adyen.com/test/payments/pi_"),
          time: expect.any(String),
        });

        expect(response.status).toStrictEqual(200);
      },
    });
  });
});
