// apps/adyen/src/pages/config/new.tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useDashboardNotification } from "@saleor/apps-shared/use-dashboard-notification";
import { useUnsavedChangesGuard } from "@saleor/apps-shared/use-unsaved-changes-guard";
import {
  AppPageHeader,
  DetailPageLayout,
  ExitFormDialog,
  Savebar,
  SettingsFieldStack,
  SettingsPageContent,
  SettingsSection,
} from "@saleor/apps-ui-next";
import { Box } from "@saleor/macaw-ui";
import { type NextPage } from "next";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { newAdyenConfigInputSchema } from "@/modules/app-config/trpc-handlers/new-adyen-config-input-schema";
import { trpcClient } from "@/modules/trpc/trpc-client";
import { MissingAppAccess } from "@/modules/ui/missing-app-access";
import {
  AdyenConfigFields,
  type AdyenConfigFormShape,
} from "@/modules/ui/adyen-configs/adyen-config-fields";
import { AdyenEnvBadge } from "@/modules/ui/adyen-configs/adyen-env-badge";
import { AdyenModeLegend } from "@/modules/ui/adyen-setup/adyen-mode-legend";
import { useHasAppAccess } from "@/modules/ui/use-has-app-access";

const FORM_ID = "new_adyen_config_form";
const CONFIG_LIST_PATH = "/config";

const NewConfiguration: NextPage = () => {
  const { haveAccessToApp, isReady } = useHasAppAccess();
  const { notifyError, notifySuccess } = useDashboardNotification();

  const {
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = useForm<AdyenConfigFormShape>({
    defaultValues: {
      name: "",
      merchantAccount: "",
      apiKey: "",
      clientKey: "",
      hmacKey: "",
    },
    resolver: zodResolver(newAdyenConfigInputSchema),
  });

  // 根据 clientKey (test_ 或 live_) 推断环境
  const clientKey = useWatch({ control, name: "clientKey" });
  const envHint = typeof clientKey === "string" 
    ? (clientKey.startsWith("live_") ? "live" : clientKey.startsWith("test_") ? "test" : null) 
    : null;

  const [isSaved, setIsSaved] = useState(false);
  const guard = useUnsavedChangesGuard({ enabled: isDirty && !isSaved });

  const {
    mutate: saveConfig,
    isLoading: isSaving,
    isError: isSaveError,
  } = trpcClient.appConfig.saveNewAdyenConfig.useMutation({
    onSuccess() {
      notifySuccess("Configuration saved");
      setIsSaved(true);
      guard.navigateWithoutGuard(CONFIG_LIST_PATH);
    },
    onError(error) {
      notifyError("Error saving config", error.message);
    },
  });

  if (isReady && !haveAccessToApp) {
    return <MissingAppAccess />;
  }

  return (
    <DetailPageLayout withSavebar data-test-id="adyen-config-new-page">
      <AppPageHeader
        title="New Adyen configuration"
        href={CONFIG_LIST_PATH}
        hrefTitle="Configuration"
      />
      <DetailPageLayout.Content>
        <SettingsPageContent
          description={
            <>
              Add a Adyen configuration. After saving, assign it to the Saleor channels that should
              use these credentials.
            </>
          }
          aside={<AdyenModeLegend />}
        >
          <Box as="form" id={FORM_ID} onSubmit={handleSubmit((values) => saveConfig(values))}>
            <SettingsSection
              title="Adyen credentials"
              ownership="channel"
              description="Credentials are used by every channel you assign to this configuration."
              headerEnd={envHint ? <AdyenEnvBadge env={envHint} /> : undefined}
              data-test-id="adyen-new-config-card"
            >
              <SettingsFieldStack>
                <AdyenConfigFields control={control} errors={errors} disabled={isSaving} />
              </SettingsFieldStack>
            </SettingsSection>
          </Box>
        </SettingsPageContent>
      </DetailPageLayout.Content>
      <Savebar>
        <Savebar.Spacer />
        <Savebar.CancelButton
          disabled={isSaving}
          onClick={() => guard.navigateWithoutGuard(CONFIG_LIST_PATH)}
        >
          Cancel
        </Savebar.CancelButton>
        <Savebar.ConfirmButton
          form={FORM_ID}
          disabled={!isDirty || isSaving}
          transitionState={isSaving ? "loading" : isSaveError ? "error" : "default"}
        >
          Save
        </Savebar.ConfirmButton>
      </Savebar>
      <ExitFormDialog
        isOpen={guard.isBlocked}
        onClose={guard.keepEditing}
        onLeave={guard.leave}
        description="The configuration has not been saved yet. Leaving now discards the credentials you entered."
      />
    </DetailPageLayout>
  );
};

export default NewConfiguration;