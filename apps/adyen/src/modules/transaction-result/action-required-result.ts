import { type Actions } from "@/generated/app-webhooks-types/transaction-initialize-session";
import { BaseError } from "@/lib/errors";
import { type AdyenPaymentIntentStatus } from "@/modules/adyen/adyen-payment-intent-status";

export class ChargeActionRequiredResult {
  readonly result = "CHARGE_ACTION_REQUIRED" as const;
  readonly actions: Actions = ["CANCEL"];

  readonly message: string;

  private getMessageFromAdyenStatus(adyenStatus: AdyenPaymentIntentStatus) {
    switch (adyenStatus) {
      case "requires_action":
        return "Payment intent requires action";
      case "requires_confirmation":
        return "Payment intent requires confirmation";
      case "requires_payment_method":
        return "Payment intent requires payment method";
      case "canceled":
        return "Payment intent was canceled";
      default:
        throw new BaseError(
          `Payment intent status ${adyenStatus} is not supported for CHARGE_ACTION_REQUIRED transaction flow`,
        );
    }
  }

  constructor(adyenStatus: AdyenPaymentIntentStatus) {
    this.message = this.getMessageFromAdyenStatus(adyenStatus);
  }
}

export class AuthorizationActionRequiredResult {
  readonly result = "AUTHORIZATION_ACTION_REQUIRED" as const;
  readonly actions: Actions = ["CANCEL"];

  readonly message: string;

  private getMessageFromAdyenStatus(adyenStatus: AdyenPaymentIntentStatus) {
    switch (adyenStatus) {
      case "requires_action":
        return "Payment intent requires action";
      case "requires_confirmation":
        return "Payment intent requires confirmation";
      case "requires_payment_method":
        return "Payment intent requires payment method";
      case "canceled":
        return "Payment intent was canceled";
      default:
        throw new BaseError(
          `Payment intent status ${adyenStatus} is not supported for AUTHORIZATION_ACTION_REQUIRED transaction flow`,
        );
    }
  }

  constructor(adyenStatus: AdyenPaymentIntentStatus) {
    this.message = this.getMessageFromAdyenStatus(adyenStatus);
  }
}
