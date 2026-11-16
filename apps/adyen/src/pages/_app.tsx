// apps/adyen/src/pages/_app.tsx
// @ts-ignore
import "@saleor/macaw-ui/style";
// @ts-ignore
import "@saleor/apps-ui-next/style";
import "@/styles/globals.css";

import { AppBridge, AppBridgeProvider } from "@saleor/app-sdk/app-bridge";
import { RoutePropagator } from "@saleor/app-sdk/app-bridge/next";
import { NoSSRWrapper } from "@saleor/apps-shared/no-ssr-wrapper";
import { ThemeProvider } from "@saleor/macaw-ui";
import { type AppProps } from "next/app";
import { useEffect, useState } from "react";

import { trpcClient } from "@/modules/trpc/trpc-client";

// 延迟初始化 AppBridge，避免在本地直接访问时报错
export let appBridgeInstance: AppBridge | undefined;
if (typeof window !== "undefined") {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("saleorApiUrl")) {
    appBridgeInstance = new AppBridge();
  }
}

// 判断是否在 iframe 中运行
const isInIframe = () => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true; // 跨域抛出错误，说明在 iframe 内
  }
};

function NextApp({ Component, pageProps }: AppProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 本地直接访问（不在 iframe 中），显示提示
  if (mounted && !isInIframe()) {
    return (
      <ThemeProvider>
        <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
          <h1>Adyen App</h1>
          <p>This app is designed to be used inside the Saleor Dashboard.</p>
          <p>Please install it and access it from your Saleor Dashboard extensions.</p>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <NoSSRWrapper>
      <ThemeProvider>
        <AppBridgeProvider appBridgeInstance={appBridgeInstance}>
          <RoutePropagator />
          <Component {...pageProps} />
        </AppBridgeProvider>
      </ThemeProvider>
    </NoSSRWrapper>
  );
}

export default trpcClient.withTRPC(NextApp);