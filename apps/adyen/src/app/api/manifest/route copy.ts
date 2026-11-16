// apps/adyen/src/app/api/manifest/route.ts
import { type AppManifest } from "@saleor/app-sdk/types";

export async function GET() {
  const iframeUrl = process.env.APP_IFRAME_BASE_URL || "http://localhost:3001";
  const apiUrl = process.env.APP_API_BASE_URL || "http://localhost:3001";

  const manifest: AppManifest = {
    id: "saleor.app.payment.adyen",
    version: "0.0.1",
    name: "Adyen",
    about: "Adyen payment app for Saleor",
    appUrl: iframeUrl,
    tokenTargetUrl: `${apiUrl}/api/register`,
    permissions: ["HANDLE_PAYMENTS"],
    webhooks: [
      {
        name: "Transaction Initialize Session",
        asyncEvents: [], // 👈 暂时留空
        syncEvents: ["TRANSACTION_INITIALIZE_SESSION"],
        query: "subscription { event { ... on TransactionInitializeSession { transaction { id } } } }", // 👈 极简 query
        targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-initialize-session`,
      }
    ],
    extensions: [],
  };

  return Response.json(manifest);
}