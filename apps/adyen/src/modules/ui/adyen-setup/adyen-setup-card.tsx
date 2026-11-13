import {
  SetupChecklist,
  type SetupChecklistReviewItem,
  setupChecklistStyles,
} from "@saleor/apps-ui-next";
import { Button, useTheme } from "@saleor/macaw-ui";
import { BookOpen, CreditCard } from "lucide-react";
import { useRouter } from "next/router";

import { type AdyenFrontendConfigSerializedFields } from "@/modules/app-config/domain/adyen-config";

import { buildAdyenSetupTasks, summarizeAdyenSetupTasks } from "./adyen-setup-summary";

type Props = {
  configs: AdyenFrontendConfigSerializedFields[];
  mapping: Record<string, AdyenFrontendConfigSerializedFields>;
  onDismiss: () => void;
};

export const AdyenSetupCard = ({ configs, mapping, onDismiss }: Props) => {
  const router = useRouter();
  const { theme } = useTheme();
  const tasks = buildAdyenSetupTasks({
    configs,
    mapping,
    addConfigAction: (
      <Button
        size="small"
        onClick={() => {
          void router.push("/config/new");
        }}
      >
        Add configuration
      </Button>
    ),
  });

  const { progress, nextUp } = summarizeAdyenSetupTasks(tasks);

  const reviewItems: SetupChecklistReviewItem[] = [
    {
      id: "docs",
      icon: <BookOpen size={16} />,
      title: "Read the Adyen app docs",
      description: "Configuration, webhooks, and storefront integration.",
      onClick: () => {
        window.open(
          "https://docs.saleor.io/developer/app-store/apps/adyen/overview",
          "_blank",
          "noopener,noreferrer",
        );
      },
    },
    {
      id: "adyen-dashboard",
      icon: <CreditCard size={16} />,
      title: "Open Adyen Dashboard",
      description: "Manage keys, webhooks, and payment methods.",
      onClick: () => {
        window.open("https://dashboard.adyen.com", "_blank", "noopener,noreferrer");
      },
    },
  ];

  return (
    <SetupChecklist
      className={[
        setupChecklistStyles.elevated,
        theme === "defaultDark" && setupChecklistStyles.elevatedDark,
      ]
        .filter(Boolean)
        .join(" ")}
      data-test-id="adyen-setup-card"
      title="Finish Adyen setup"
      subtitle="Connect Adyen and assign channels on a configuration card before taking payments."
      progress={progress}
      tasksSection={{ title: "Required for payments" }}
      tasks={tasks}
      reviewSection={{
        title: "Useful links",
        items: reviewItems,
      }}
      nextUp={nextUp}
      footerActions={
        <Button variant="tertiary" size="small" onClick={onDismiss}>
          Dismiss
        </Button>
      }
    />
  );
};
