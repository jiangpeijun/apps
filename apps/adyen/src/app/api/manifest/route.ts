// apps/adyen/src/app/api/manifest/route.ts
import { type AppManifest } from "@saleor/app-sdk/types";
import {
  PAYMENT_GATEWAY_INITIALIZE_SESSION_SUBSCRIPTION,
  TRANSACTION_INITIALIZE_SESSION_SUBSCRIPTION,
  TRANSACTION_PROCESS_SESSION_SUBSCRIPTION,
  TRANSACTION_REFUND_REQUESTED_SUBSCRIPTION,
  TRANSACTION_CANCELATION_REQUESTED_SUBSCRIPTION,
} from "@/modules/saleor/webhook-subscriptions";

const iframeUrl = process.env.APP_IFRAME_BASE_URL as string;
const apiUrl = process.env.APP_API_BASE_URL as string;

const manifestTemplate: AppManifest = {
  id: "saleor.app.payment.adyen",
  version: "0.0.1",
  name: "Adyen",
  about: "Adyen payment app for Saleor",
  appUrl: iframeUrl,
  tokenTargetUrl: `${apiUrl}/api/register`,
  permissions: ["HANDLE_PAYMENTS"],
  requiredSaleorVersion: "^3.22",
  webhooks: [
    // {
    //   name: "Payment Gateway Initialize Session",
    //   syncEvents: ["PAYMENT_GATEWAY_INITIALIZE_SESSION"],
    //   query: PAYMENT_GATEWAY_INITIALIZE_SESSION_SUBSCRIPTION,
    //   targetUrl: `${apiUrl}/api/webhooks/saleor/payment-gateway-initialize-session`,
    // },
    {
      name: "Transaction Initialize Session",
      asyncEvents: [],
      syncEvents: ["TRANSACTION_INITIALIZE_SESSION"],
      query: TRANSACTION_INITIALIZE_SESSION_SUBSCRIPTION,
      targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-initialize-session`,
    },
    // {
    //   name: "Transaction Process Session",
    //   syncEvents: ["TRANSACTION_PROCESS_SESSION"],
    //   query: TRANSACTION_PROCESS_SESSION_SUBSCRIPTION,
    //   targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-process-session`,
    // },
    // {
    //   name: "Transaction Refund Requested",
    //   syncEvents: ["TRANSACTION_REFUND_REQUESTED"],
    //   query: TRANSACTION_REFUND_REQUESTED_SUBSCRIPTION,
    //   targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-refund-requested`,
    // },
    // {
    //   name: "Transaction Cancelation Requested",
    //   syncEvents: ["TRANSACTION_CANCELATION_REQUESTED"],
    //   query: TRANSACTION_CANCELATION_REQUESTED_SUBSCRIPTION,
    //   targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-cancelation-requested`,
    // },
  ],
  extensions: [],
};

export async function GET() {
  const dynamicManifest: AppManifest = {
    ...manifestTemplate,
    appUrl: iframeUrl,
    tokenTargetUrl: `${apiUrl}/api/register`,
    webhooks: manifestTemplate.webhooks?.map((webhook) => ({
      ...webhook,
      targetUrl: (webhook.targetUrl as string).replace(
        process.env.APP_IFRAME_BASE_URL as string,
        apiUrl,
      ),
    })),
  };

  return Response.json(dynamicManifest);
}