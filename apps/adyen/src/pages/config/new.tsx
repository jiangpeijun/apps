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
import { inferAdyenEnvFromKeys } from "@/modules/ui/adyen-configs/infer-adyen-env-from-keys";
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
      publishableKey: "",
      restrictedKey: "",
    },
    resolver: zodResolver(newAdyenConfigInputSchema),
  });

  const publishableKey = useWatch({ control, name: "publishableKey" });
  const restrictedKey = useWatch({ control, name: "restrictedKey" });
  const envHint = inferAdyenEnvFromKeys({ publishableKey, restrictedKey });

  /**
   * Submitting is not enough to drop the guard: react-hook-form reports a successful submit as
   * soon as the mutation is fired, while the keys are only safe once the server accepted them.
   */
  const [isSaved, setIsSaved] = useState(false);

  const guard = useUnsavedChangesGuard({ enabled: isDirty && !isSaved });

  /**
   * Saving creates a Adyen webhook, so a second submit would leave an orphaned
   * configuration behind — the savebar and inputs stay locked while it is in flight.
   */
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

  /*
   * The empty form is safe to show while AppBridge handshakes - Save stays disabled until the
   * user types. Only claim missing access once permissions are actually known.
   */
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
              use these keys on the configuration card.
            </>
          }
          aside={<AdyenModeLegend />}
        >
          <Box as="form" id={FORM_ID} onSubmit={handleSubmit((values) => saveConfig(values))}>
            <SettingsSection
              title="Adyen keys"
              ownership="channel"
              description="Keys are used by every channel you assign to this configuration."
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
        description="The configuration has not been saved yet. Leaving now discards the keys you entered."
      />
    </DetailPageLayout>
  );
};

export default NewConfiguration;
