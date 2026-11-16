import { withSentryConfig } from "@sentry/nextjs/config";
import { type NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 放行 Cloudflare 域名
  allowedDevOrigins: ["sms-especially-oct-upgrading.trycloudflare.com"],
  transpilePackages: [
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
    /*
     * Share one @opentelemetry/api instance between instrumentation and routes.
     */
    "@opentelemetry/api",
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/util-dynamodb",
    "dynamodb-toolbox",
  ],
  webpack: (config, { isServer, dev }) => {
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