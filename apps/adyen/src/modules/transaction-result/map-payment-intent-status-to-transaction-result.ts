import { assertUnreachable } from "@/lib/assert-unreachable";
import { type ResolvedTransactionFlow } from "@/modules/resolved-transaction-flow";
import { type AdyenPaymentIntentStatus } from "@/modules/adyen/adyen-payment-intent-status";

import {
  AuthorizationActionRequiredResult,
  ChargeActionRequiredResult,
} from "./action-required-result";
import { AuthorizationRequestResult, ChargeRequestResult } from "./request-result";
import { AuthorizationSuccessResult, ChargeSuccessResult } from "./success-result";

export const mapPaymentIntentStatusToTransactionResult = (
  adyenPaymentIntentStatus: AdyenPaymentIntentStatus,
  resolvedTransactionFlow: ResolvedTransactionFlow,
) => {
  switch (adyenPaymentIntentStatus) {
    case "succeeded":
      return new ChargeSuccessResult();

    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "canceled":
      if (resolvedTransactionFlow === "CHARGE") {
        return new ChargeActionRequiredResult(adyenPaymentIntentStatus);
      }

      return new AuthorizationActionRequiredResult(adyenPaymentIntentStatus);
    case "processing":
      if (resolvedTransactionFlow === "CHARGE") {
        return new ChargeRequestResult();
      }

      return new AuthorizationRequestResult();
    case "requires_capture":
      return new AuthorizationSuccessResult();
    default:
      assertUnreachable(adyenPaymentIntentStatus);
  }
};
