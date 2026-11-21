// apps/adyen/src/app/api/manifest/route.ts
import { type AppManifest } from "@saleor/app-sdk/types";

import {
  PAYMENT_GATEWAY_INITIALIZE_SESSION_SUBSCRIPTION,
  TRANSACTION_CANCELATION_REQUESTED_SUBSCRIPTION,
  TRANSACTION_CHARGE_REQUESTED_SUBSCRIPTION,
  TRANSACTION_INITIALIZE_SESSION_SUBSCRIPTION,
  TRANSACTION_PROCESS_SESSION_SUBSCRIPTION,
  TRANSACTION_REFUND_REQUESTED_SUBSCRIPTION,
} from "@/modules/saleor/webhook-subscriptions";

/** 读必需的环境变量，顺手去掉尾部斜杠，避免拼出 //api/register */
const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`[manifest] 环境变量 ${name} 未设置`);
  }

  return value.replace(/\/+$/, "");
};

export async function GET() {
  const iframeUrl = requireEnv("APP_IFRAME_BASE_URL");
  const apiUrl = requireEnv("APP_API_BASE_URL");

  const manifest: AppManifest = {
    id: "saleor.app.payment.adyen",
    version: "0.0.1",
    name: "Adyen",
    about: "Adyen payment app for Saleor",
    appUrl: iframeUrl,
    tokenTargetUrl: `${apiUrl}/api/register`,
    permissions: ["HANDLE_PAYMENTS"],
    requiredSaleorVersion: "^3.22",
    webhooks: [
      {
        name: "Payment Gateway Initialize Session",
        syncEvents: ["PAYMENT_GATEWAY_INITIALIZE_SESSION"],
        query: PAYMENT_GATEWAY_INITIALIZE_SESSION_SUBSCRIPTION,
        targetUrl: `${apiUrl}/api/webhooks/saleor/payment-gateway-initialize-session`,
      },
      {
        name: "Transaction Initialize Session",
        syncEvents: ["TRANSACTION_INITIALIZE_SESSION"],
        query: TRANSACTION_INITIALIZE_SESSION_SUBSCRIPTION,
        targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-initialize-session`,
      },
      {
        name: "Transaction Process Session",
        syncEvents: ["TRANSACTION_PROCESS_SESSION"],
        query: TRANSACTION_PROCESS_SESSION_SUBSCRIPTION,
        targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-process-session`,
      },
      {
        name: "Transaction Charge Requested",
        syncEvents: ["TRANSACTION_CHARGE_REQUESTED"],
        query: TRANSACTION_CHARGE_REQUESTED_SUBSCRIPTION,
        targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-charge-requested`,
      },
      {
        name: "Transaction Refund Requested",
        syncEvents: ["TRANSACTION_REFUND_REQUESTED"],
        query: TRANSACTION_REFUND_REQUESTED_SUBSCRIPTION,
        targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-refund-requested`,
      },
      {
        name: "Transaction Cancelation Requested",
        syncEvents: ["TRANSACTION_CANCELATION_REQUESTED"],
        query: TRANSACTION_CANCELATION_REQUESTED_SUBSCRIPTION,
        targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-cancelation-requested`,
      },
    ],
    extensions: [],
  };

  return Response.json(manifest);
}
