// apps\adyen\src\app\api\webhooks\saleor\transaction-refund-requested\webhook-definition.ts
import { SaleorSyncWebhook } from "@saleor/app-sdk/handlers/next-app-router";

import {
  TransactionRefundRequestedDocument,
  type TransactionRefundRequestedEventFragment,
} from "@/generated/graphql";
import { saleorApp } from "@/lib/saleor-app";

import { verifyWebhookSignature } from "../verify-signature";

/**
 * 这份定义决定的是「事件类型 + 签名校验 + 回调路径」，逻辑上不需要改动。
 * 需要盯的是 TransactionRefundRequestedDocument 的订阅体字段：
 * 当前只有 action { amount: number, currency }，
 * 没有 event.amount(Money)、chargedAmount、grantedRefund。
 * 若要支持 Dashboard 按行退款（grantedRefund 路径），需把订阅补成：
 *
 *   amount { amount currency }
 *   grantedRefund { id amount { amount currency } }
 *   transaction { ... chargedAmount { amount currency } }
 *
 * 补完 pnpm generate:adyen 重新生成即可，resolveRefundMoney 已优先读 amount。
 */
export const transactionRefundRequestedWebhookDefinition =
  new SaleorSyncWebhook<TransactionRefundRequestedEventFragment>({
    apl: saleorApp.apl,
    event: "TRANSACTION_REFUND_REQUESTED",
    // 这个名字只用于日志与调试，Dashboard 里显示的 webhook 名由 manifest/route.ts 决定
    name: "Adyen Transaction Refund Requested",
    isActive: true,
    query: TransactionRefundRequestedDocument,
    webhookPath: "api/webhooks/saleor/transaction-refund-requested",
    verifySignatureFn: (jwks, signature, rawBody) => {
      return verifyWebhookSignature(jwks, signature, rawBody);
    },
  });
