// apps\apps\adyen\src\pages\config\index.tsx
import { ParkedSetupChecklist } from "@saleor/apps-ui-next";
import { type NextPage } from "next";
import { useMemo } from "react";

import { trpcClient } from "@/modules/trpc/trpc-client";
import { MissingAppAccess } from "@/modules/ui/missing-app-access";
import {
  ChannelConfigSection,
  ChannelConfigSectionSkeleton,
} from "@/modules/ui/adyen-configs/channel-config-section";
import { ConfigPageShell } from "@/modules/ui/adyen-configs/config-page-shell";
import { AdyenSetupCard } from "@/modules/ui/adyen-setup/adyen-setup-card";
import {
  buildAdyenSetupTasks,
  summarizeAdyenSetupTasks,
} from "@/modules/ui/adyen-setup/adyen-setup-summary";
import { useAdyenSetupCardDismiss } from "@/modules/ui/adyen-setup/use-adyen-setup-card-dismiss";
import { useHasAppAccess } from "@/modules/ui/use-has-app-access";

const ConfigPage: NextPage = () => {
  const { haveAccessToApp, isReady } = useHasAppAccess();
  const { dismissed, dismiss, restore } = useAdyenSetupCardDismiss();
  const configsQuery = trpcClient.appConfig.getAdyenConfigsList.useQuery();
  const mappingQuery = trpcClient.appConfig.channelsConfigsMapping.useQuery();

  const parkedSummary = useMemo(() => {
    if (!configsQuery.data || !mappingQuery.data) {
      return null;
    }

    return summarizeAdyenSetupTasks(
      buildAdyenSetupTasks({
        configs: configsQuery.data,
        mapping: mappingQuery.data,
      }),
    );
  }, [configsQuery.data, mappingQuery.data]);

  if (!isReady) {
    return (
      <ConfigPageShell>
        <ChannelConfigSectionSkeleton />
      </ConfigPageShell>
    );
  }

  if (!haveAccessToApp) {
    return <MissingAppAccess />;
  }

  const dataReady = configsQuery.data !== undefined && mappingQuery.data !== undefined;
  const showSetup = !dismissed && dataReady;
  const showParked = dismissed && dataReady && parkedSummary !== null;

  return (
    <ConfigPageShell>
      {showSetup ? (
        <AdyenSetupCard
          configs={configsQuery.data}
          mapping={mappingQuery.data}
          onDismiss={dismiss}
        />
      ) : null}
      {showParked && parkedSummary ? (
        <ParkedSetupChecklist
          title="Finish Adyen setup"
          progress={parkedSummary.progress}
          nextUp={parkedSummary.nextUp}
          onReveal={restore}
          data-test-id="adyen-parked-setup-checklist"
        />
      ) : null}
      <ChannelConfigSection />
    </ConfigPageShell>
  );
};

export default ConfigPage;
