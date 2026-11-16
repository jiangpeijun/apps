// apps\apps\adyen\src\pages\config\[configId].tsx
import {
  AppPageHeader,
  DetailPageLayout,
  SettingsFieldStack,
  SettingsPageContent,
  SettingsSection,
} from "@saleor/apps-ui-next";
import { Skeleton, Text } from "@saleor/macaw-ui";
import { type NextPage } from "next";
import { useRouter } from "next/router";
import { type ReactNode } from "react";

import { trpcClient } from "@/modules/trpc/trpc-client";
import { MissingAppAccess } from "@/modules/ui/missing-app-access";
import { EditAdyenConfigView } from "@/modules/ui/adyen-configs/edit-adyen-config-view";
import { useHasAppAccess } from "@/modules/ui/use-has-app-access";

const CONFIG_LIST_PATH = "/config";

const Placeholder = ({ children }: { children: ReactNode }) => (
  <DetailPageLayout.Content>
    <SettingsPageContent>
      <SettingsSection title="Adyen keys" ownership="channel">
        <SettingsFieldStack>{children}</SettingsFieldStack>
      </SettingsSection>
    </SettingsPageContent>
  </DetailPageLayout.Content>
);

const EditConfiguration: NextPage = () => {
  const { haveAccessToApp, isReady } = useHasAppAccess();
  const router = useRouter();
  const configId = typeof router.query.configId === "string" ? router.query.configId : null;

  const configsQuery = trpcClient.appConfig.getAdyenConfigsList.useQuery(undefined, {
    /** Deep link or reload lands here without the list ever being fetched. */
    refetchOnMount: true,
  });

  const config = configsQuery.data?.find((item) => item.id === configId);

  if (isReady && !haveAccessToApp) {
    return <MissingAppAccess />;
  }

  return (
    <DetailPageLayout withSavebar={config !== undefined} data-test-id="adyen-config-edit-page">
      <AppPageHeader
        title={config?.name ?? "Configuration"}
        href={CONFIG_LIST_PATH}
        hrefTitle="Configuration"
      />
      {!isReady || configsQuery.isLoading || !configId ? (
        <Placeholder>
          <Skeleton />
        </Placeholder>
      ) : configsQuery.error ? (
        <Placeholder>
          <Text color="critical1">Error fetching config: {configsQuery.error.message}</Text>
        </Placeholder>
      ) : config ? (
        /** Remount on a different configuration so the form re-seeds its defaults. */
        <EditAdyenConfigView key={config.id} config={config} />
      ) : (
        <Placeholder>
          <Text size={3} color="default2">
            This configuration no longer exists. It may have been deleted from another tab.
          </Text>
        </Placeholder>
      )}
    </DetailPageLayout>
  );
};

export default EditConfiguration;
