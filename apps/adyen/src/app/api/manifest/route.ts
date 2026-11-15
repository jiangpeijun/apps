import { AppManifest } from "@saleor/app-sdk/types";
import {
  TRANSACTION_INITIALIZE_SESSION_SUBSCRIPTION,
  TRANSACTION_PROCESS_SESSION_SUBSCRIPTION,
  TRANSACTION_REFUND_REQUESTED_SUBSCRIPTION,
  TRANSACTION_CANCELATION_REQUESTED_SUBSCRIPTION,
} from "@/modules/saleor/webhook-subscriptions";

export const manifest: AppManifest = {
  id: "saleor.app.payment.adyen",
  version: "0.0.1",
  name: "Adyen",
  about: "Adyen payment app for Saleor",
  appUrl: process.env.APP_IFRAME_BASE_URL!,
  tokenTargetUrl: `${process.env.APP_API_BASE_URL}/api/register`,
  permissions: ["HANDLE_PAYMENTS"],
  requiredSaleorVersion: "^3.22",
  webhooks: [
    {
      name: "Transaction Initialize Session",
      syncEvents: ["TRANSACTION_INITIALIZE_SESSION"],
      query: TRANSACTION_INITIALIZE_SESSION_SUBSCRIPTION,
      targetUrl: `${process.env.APP_API_BASE_URL}/api/webhooks/saleor/transaction-initialize-session`,
    },
    {
      name: "Transaction Process Session",
      syncEvents: ["TRANSACTION_PROCESS_SESSION"],
      query: TRANSACTION_PROCESS_SESSION_SUBSCRIPTION,
      targetUrl: `${process.env.APP_API_BASE_URL}/api/webhooks/saleor/transaction-process-session`,
    },
    {
      name: "Transaction Refund Requested",
      syncEvents: ["TRANSACTION_REFUND_REQUESTED"],
      query: TRANSACTION_REFUND_REQUESTED_SUBSCRIPTION,
      targetUrl: `${process.env.APP_API_BASE_URL}/api/webhooks/saleor/transaction-refund-requested`,
    },
    {
      name: "Transaction Cancelation Requested",
      syncEvents: ["TRANSACTION_CANCELATION_REQUESTED"],
      query: TRANSACTION_CANCELATION_REQUESTED_SUBSCRIPTION,
      targetUrl: `${process.env.APP_API_BASE_URL}/api/webhooks/saleor/transaction-cancelation-requested`,
    },
  ],
  extensions: [],
};

export default manifest;