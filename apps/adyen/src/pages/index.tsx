import { useAppBridge } from "@saleor/app-sdk/app-bridge";
import { isInIframe } from "@saleor/apps-shared/is-in-iframe";
import { type NextPage } from "next";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useIsMounted } from "usehooks-ts";

import { ChannelConfigSectionSkeleton } from "@/modules/ui/adyen-configs/channel-config-section";
import { ConfigPageShell } from "@/modules/ui/adyen-configs/config-page-shell";

const IndexPage: NextPage = () => {
  const { appBridgeState } = useAppBridge();
  const isMounted = useIsMounted();
  const { replace } = useRouter();

  useEffect(() => {
    if (isMounted() && appBridgeState?.ready) {
      replace("/config");
    }
  }, [isMounted, appBridgeState?.ready, replace]);

  if (isInIframe()) {
    return (
      <ConfigPageShell>
        <ChannelConfigSectionSkeleton />
      </ConfigPageShell>
    );
  }

  return (
    <div>
      <h1>Saleor App Payment Adyen</h1>
      <p>
        This is Saleor App that allows to accept online payments from customers using Adyen as
        their payment processor.
      </p>
      <p>Install the app in your Saleor instance and open it in Dashboard.</p>
    </div>
  );
};

export default IndexPage;
