// apps/adyen/src/pages/_app.tsx
import "@/styles/globals.css";

import { AppBridge, AppBridgeProvider } from "@saleor/app-sdk/app-bridge";
import { RoutePropagator } from "@saleor/app-sdk/app-bridge/next";
import { GraphQLProvider } from "@saleor/apps-shared/graphql-provider";
import { ThemeProvider } from "@saleor/macaw-ui";
import { type AppProps } from "next/app";
import { useEffect, useState } from "react";

import { trpcClient } from "@/modules/trpc/trpc-client";

// 供 trpc-client.ts 使用
export const appBridgeInstance = typeof window !== "undefined" ? new AppBridge() : undefined;

function NextApp({ Component, pageProps }: AppProps) {
  const [mounted, setMounted] = useState(false);

  // 确保只在客户端渲染，避免 SSR 导致 AppBridge 上下文丢失
  useEffect(() => {
    setMounted(true);
  }, []);

  // SSR 阶段返回空，或者一个简单的骨架屏
  if (!mounted) return null;

  return (
    <ThemeProvider>
      <AppBridgeProvider appBridgeInstance={appBridgeInstance}>
        <GraphQLProvider>
          <RoutePropagator />
          <Component {...pageProps} />
        </GraphQLProvider>
      </AppBridgeProvider>
    </ThemeProvider>
  );
}

export default trpcClient.withTRPC(NextApp);