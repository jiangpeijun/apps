import { type StripeEnv } from "@/modules/adyen/adyen-env";

/** UI wording for a Stripe environment. Stripe calls its test mode "sandbox" in the dashboard. */
export const stripeEnvLabel = (env: StripeEnv): "Sandbox" | "Live" =>
  env === "TEST" ? "Sandbox" : "Live";
