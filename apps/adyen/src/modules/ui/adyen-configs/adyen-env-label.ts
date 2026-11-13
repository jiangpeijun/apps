import { type AdyenEnv } from "@/modules/adyen/adyen-env";

/** UI wording for a Adyen environment. Adyen calls its test mode "sandbox" in the dashboard. */
export const adyenEnvLabel = (env: AdyenEnv): "Sandbox" | "Live" =>
  env === "TEST" ? "Sandbox" : "Live";
