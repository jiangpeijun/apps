// apps/adyen/src/pages/_app.tsx
import "@/styles/globals.css";

import { AppBridge, AppBridgeProvider } from "@saleor/app-sdk/app-bridge";
import { RoutePropagator } from "@saleor/app-sdk/app-bridge/next";
import { NoSSRWrapper } from "@saleor/apps-shared/no-ssr-wrapper";
import { ThemeProvider } from "@saleor/macaw-ui";
import { type AppProps } from "next/app";

import { trpcClient } from "@/modules/trpc/trpc-client";

export const appBridgeInstance = typeof window !== "undefined" ? new AppBridge() : undefined;

function NextApp({ Component, pageProps }: AppProps) {
  return (
    <NoSSRWrapper>
      <ThemeProvider>
        <AppBridgeProvider appBridgeInstance={appBridgeInstance}>
          {/* 👇 核心修复：直接去掉 GraphQLProvider，因为我们用 tRPC 拿数据 */}
          <RoutePropagator />
          <Component {...pageProps} />
        </AppBridgeProvider>
      </ThemeProvider>
    </NoSSRWrapper>
  );
}

export default trpcClient.withTRPC(NextApp);