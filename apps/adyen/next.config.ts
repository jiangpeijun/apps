// apps/adyen/next.config.ts
import { withSentryConfig } from "@sentry/nextjs/config";
import { type NextConfig } from "next";
import path from "path";
import { createRequire } from "module";

// 👇 动态获取当前环境下 @saleor/app-sdk 的唯一绝对物理路径
const require = createRequire(import.meta.url);
const appSdkPath = path.dirname(require.resolve("@saleor/app-sdk/package.json"));
// 从环境变量读取隧道域名，.env 里定义 APP_IFRAME_BASE_URL
const tunnelBaseUrl = process.env.APP_IFRAME_BASE_URL ?? "";
// 提取 host，allowedDevOrigins 只需要 host，不要 https://
const tunnelHost = tunnelBaseUrl.replace("https://", "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 放行 Cloudflare 域名
  allowedDevOrigins: tunnelHost ? [tunnelHost] : [],
  transpilePackages: [
    "@saleor/app-sdk",
    "@saleor/apps-logger",
    "@saleor/apps-otel",
    "@saleor/apps-shared",
    "@saleor/apps-trpc",
    "@saleor/apps-ui",
    "@saleor/apps-ui-next",
    "@saleor/react-hook-form-macaw",
  ],
  experimental: {
    optimizePackageImports: ["@sentry/nextjs", "@sentry/node"],
  },
  bundlePagesRouterDependencies: true,
  serverExternalPackages: [
    "@opentelemetry/api",
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/util-dynamodb",
    "dynamodb-toolbox",
  ],
  webpack: (config, { isServer, dev }) => {
    // 👇 核心修复：强制让所有代码（包括 packages/ui 里的 TextLink）都使用同一个 app-sdk 实例
    config.resolve.alias = {
      ...config.resolve.alias,
      "@saleor/app-sdk": appSdkPath,
    };

    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "D:/DumpStack.log.tmp",
          "D:/pagefile.sys",
          "D:/hiberfil.sys",
          "D:/System Volume Information/**",
        ],
      };
    }

    if (isServer) {
      // Ignore opentelemetry warnings
      config.ignoreWarnings = [{ module: /require-in-the-middle/ }];
    }

    return config;
  },
};

// Make sure to export sentry config as the last one
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  webpack: {
    autoInstrumentServerFunctions: false,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});