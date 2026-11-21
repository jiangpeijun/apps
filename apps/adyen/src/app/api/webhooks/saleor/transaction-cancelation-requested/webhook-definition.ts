// apps\adyen\src\app\api\webhooks\saleor\transaction-cancelation-requested\webhook-definition.ts
import { SaleorSyncWebhook } from "@saleor/app-sdk/handlers/next-app-router";

import {
  TransactionCancelationRequestedDocument,
  type TransactionCancelationRequestedEventFragment,
} from "@/generated/graphql";
import { saleorApp } from "@/lib/saleor-app";

import { verifyWebhookSignature } from "../verify-signature";

/**
 * 订阅体（webhook-subscriptions.ts 第 163 行起）必须含 action { amount currency }：
 * Saleor 3.23 的 TransactionCancelationRequested 没有 event.amount，
 * 取消金额只存在于 action.amount（3.21 起会填用户请求额，未指定则回填 authorizedAmount）。
 * 改完订阅务必 pnpm generate:adyen 重新生成 src/generated/graphql.ts。
 */
export const transactionCancelationRequestedWebhookDefinition =
  new SaleorSyncWebhook<TransactionCancelationRequestedEventFragment>({
    apl: saleorApp.apl,
    event: "TRANSACTION_CANCELATION_REQUESTED",
    name: "Adyen Transaction Cancelation Requested",
    isActive: true,
    query: TransactionCancelationRequestedDocument,
    webhookPath: "api/webhooks/saleor/transaction-cancelation-requested",
    verifySignatureFn: (jwks, signature, rawBody) => {
      return verifyWebhookSignature(jwks, signature, rawBody);
    },
  });


