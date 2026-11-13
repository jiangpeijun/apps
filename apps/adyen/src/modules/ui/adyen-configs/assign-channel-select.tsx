import { Box, Select } from "@saleor/macaw-ui";

import {
  AdyenFrontendConfig,
  type AdyenFrontendConfigSerializedFields,
} from "@/modules/app-config/domain/adyen-config";

import styles from "./adyen-config-cards.module.css";
import { adyenEnvLabel } from "./adyen-env-label";

const PLACEHOLDER_VALUE = "";

type Props = {
  channelName: string;
  configs: AdyenFrontendConfigSerializedFields[];
  disabled?: boolean;
  onAssign: (configId: string) => void;
};

/**
 * Assigns one unassigned channel to a configuration without opening a card editor — the
 * per-channel select the app had before configurations owned their own channel lists.
 *
 * Options carry the environment, because picking sandbox or live here decides whether that
 * channel takes real payments.
 */
export const AssignChannelSelect = ({
  channelName,
  configs,
  disabled = false,
  onAssign,
}: Props) => (
  <Box className={styles.assignSelect}>
    <Select
      size="small"
      aria-label={`Assign ${channelName} to a configuration`}
      disabled={disabled || configs.length === 0}
      value={PLACEHOLDER_VALUE}
      options={[
        { value: PLACEHOLDER_VALUE, label: "Assign to…" },
        ...configs.map((config) => ({
          value: config.id,
          label: `${config.name} · ${adyenEnvLabel(
            AdyenFrontendConfig.createFromSerializedFields(config).getAdyenEnvValue(),
          )}`,
        })),
      ]}
      onChange={(value) => {
        if (value === PLACEHOLDER_VALUE) {
          return;
        }

        onAssign(value);
      }}
      data-test-id={`assign-single-channel-${channelName}`}
    />
  </Box>
);
