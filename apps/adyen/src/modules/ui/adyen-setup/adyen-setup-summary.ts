import { type SetupChecklistTask } from "@saleor/apps-ui-next";

import { type AdyenFrontendConfigSerializedFields } from "@/modules/app-config/domain/adyen-config";

type Configs = AdyenFrontendConfigSerializedFields[];
type Mapping = Record<string, AdyenFrontendConfigSerializedFields>;

/** Shared task model for the full checklist and the parked affordance. */
export const buildAdyenSetupTasks = ({
  configs,
  mapping,
  addConfigAction,
}: {
  configs: Configs;
  mapping: Mapping;
  addConfigAction?: SetupChecklistTask["action"];
}): SetupChecklistTask[] => {
  const hasConfig = configs.length > 0;
  const hasMapping = Object.keys(mapping).length > 0;

  const addStatus = hasConfig ? "completed" : "active";
  const mapStatus = !hasConfig ? "locked" : hasMapping ? "completed" : "active";

  return [
    {
      id: "add-config",
      title: "Add a Adyen configuration",
      description: "Connect publishable and restricted API keys from Adyen.",
      status: addStatus,
      details:
        "Each configuration can be test or live mode. Keys must be from the same Adyen environment.",
      action: addStatus === "active" ? addConfigAction : undefined,
    },
    {
      id: "map-channel",
      title: "Assign a channel to a configuration",
      description: "Open Assign channels on a configuration card and select Saleor channels.",
      status: mapStatus,
      requirement: !hasConfig ? "Requires a configuration" : undefined,
      details:
        "Multiple channels can share one configuration. Channels without an assignment cannot take Adyen payments.",
    },
  ];
};

export const summarizeAdyenSetupTasks = (tasks: SetupChecklistTask[]) => {
  const done = tasks.filter((t) => t.status === "completed").length;
  const nextTask = tasks.find((t) => t.status === "active" || t.status === "pending");
  const nextTitle = typeof nextTask?.title === "string" ? nextTask.title : undefined;

  return {
    progress: { done, total: tasks.length },
    nextUp: nextTitle ? `Next up: ${nextTitle}` : undefined,
  };
};
