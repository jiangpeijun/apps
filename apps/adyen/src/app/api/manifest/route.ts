// apps/adyen/src/app/api/manifest/route.ts
import { type AppManifest } from "@saleor/app-sdk/types";
import {
  TRANSACTION_INITIALIZE_SESSION_SUBSCRIPTION,
  TRANSACTION_PROCESS_SESSION_SUBSCRIPTION,
  TRANSACTION_REFUND_REQUESTED_SUBSCRIPTION,
  TRANSACTION_CANCELATION_REQUESTED_SUBSCRIPTION,
} from "@/modules/saleor/webhook-subscriptions";

const iframeUrl = process.env.APP_IFRAME_BASE_URL as string;
const apiUrl = process.env.APP_API_BASE_URL as string;

// 定义模板，后续会在 GET 请求中动态替换 URL
const manifestTemplate: AppManifest = {
  id: "saleor.app.payment.adyen",
  version: "0.0.1",
  name: "Adyen",
  about: "Adyen payment app for Saleor",
  appUrl: iframeUrl, // 占位
  tokenTargetUrl: `${apiUrl}/api/register`, // 占位
  permissions: ["HANDLE_PAYMENTS"],
  requiredSaleorVersion: "^3.22",
  webhooks: [
    // {
    //   name: "Transaction Initialize Session",
    //   syncEvents: ["TRANSACTION_INITIALIZE_SESSION"],
    //   query: TRANSACTION_INITIALIZE_SESSION_SUBSCRIPTION,
    //   targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-initialize-session`, // 占位
    // },
    // {
    //   name: "Transaction Process Session",
    //   syncEvents: ["TRANSACTION_PROCESS_SESSION"],
    //   query: TRANSACTION_PROCESS_SESSION_SUBSCRIPTION,
    //   targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-process-session`, // 占位
    // },
    // {
    //   name: "Transaction Refund Requested",
    //   syncEvents: ["TRANSACTION_REFUND_REQUESTED"],
    //   query: TRANSACTION_REFUND_REQUESTED_SUBSCRIPTION,
    //   targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-refund-requested`, // 占位
    // },
    // {
    //   name: "Transaction Cancelation Requested",
    //   syncEvents: ["TRANSACTION_CANCELATION_REQUESTED"],
    //   query: TRANSACTION_CANCELATION_REQUESTED_SUBSCRIPTION,
    //   targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-cancelation-requested`, // 占位
    // },
    {
      name: "Transaction Initialize Session",
      asyncEvents: [], // 👈 暂时留空
      syncEvents: ["TRANSACTION_INITIALIZE_SESSION"],
      query:
        "subscription { event { ... on TransactionInitializeSession { transaction { id } } } }", // 👈 极简 query
      targetUrl: `${apiUrl}/api/webhooks/saleor/transaction-initialize-session`,
    },
  ],
  extensions: [],
};

// 导出一个标准的 Next.js App Router GET 处理函数
export async function GET() {
  // 动态替换 URL，确保浏览器访问 iframeUrl，Docker 访问 apiUrl
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

  // 返回 JSON 响应
  return Response.json(dynamicManifest);
}
