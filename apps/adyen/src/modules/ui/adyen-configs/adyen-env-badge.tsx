import { Text } from "@saleor/macaw-ui";

import { type AdyenEnv } from "@/modules/adyen/adyen-env";

import styles from "./adyen-env-badge.module.css";
import { adyenEnvLabel } from "./adyen-env-label";

type Props = {
  env: AdyenEnv;
  "data-test-id"?: string;
};

/**
 * Compact Sandbox / Live pill for config card headers.
 *
 * Geometry follows Geist/Vercel status badges (`padding: 0 10px`, `border-radius: 9999px`)
 * and Dashboard status `Pill` capsules — wider X than Y so the rounded caps don’t pinch the label.
 * Colors follow Adyen Dashboard mode chrome (navy sandbox, blurple live).
 */
export const AdyenEnvBadge = ({ env, "data-test-id": dataTestId }: Props): JSX.Element => {
  const isSandbox = env === "TEST";
  const title = isSandbox ? "Adyen sandbox keys" : "Adyen live keys";

  return (
    <Text
      as="span"
      size={1}
      fontWeight="medium"
      title={title}
      className={`${styles.pill} ${isSandbox ? styles.sandbox : styles.live}`}
      data-test-id={
        dataTestId ?? (isSandbox ? "adyen-env-badge-sandbox" : "adyen-env-badge-live")
      }
    >
      {adyenEnvLabel(env)}
    </Text>
  );
};

AdyenEnvBadge.displayName = "AdyenEnvBadge";
