import { err, ok, type Result } from "neverthrow";
import type Adyen from "adyen";

import { type Paymentmethoddetails } from "@/generated/app-webhooks-types/transaction-process-session";
import { type PaymentMethodDetailsInput } from "@/generated/graphql";
import { BaseError } from "@/lib/errors";

export type SaleorPaymentMethodDetailsErrorType = InstanceType<
  typeof SaleorPaymentMethodDetails.SaleorPaymentMethodDetailsError
>;

export class SaleorPaymentMethodDetails {
  private adyenPaymentMethod: Adyen.PaymentMethod;

  private constructor(adyenPaymentMethod: Adyen.PaymentMethod) {
    this.adyenPaymentMethod = adyenPaymentMethod;
  }

  static SaleorPaymentMethodDetailsError = BaseError.subclass("SaleorPaymentMethodDetailsError", {
    props: {
      _internalName: "SaleorPaymentMethodDetails.SaleorPaymentMethodDetailsError" as const,
    },
  });

  static createFromAdyen(
    paymentMethod: string | Adyen.PaymentMethod | null,
  ): Result<SaleorPaymentMethodDetails, SaleorPaymentMethodDetailsErrorType> {
    if (!paymentMethod) {
      return err(
        new SaleorPaymentMethodDetails.SaleorPaymentMethodDetailsError("Payment method is null"),
      );
    }

    if (typeof paymentMethod === "string") {
      return err(
        new SaleorPaymentMethodDetails.SaleorPaymentMethodDetailsError(
          "Payment method is a string",
        ),
      );
    }

    return ok(new SaleorPaymentMethodDetails(paymentMethod));
  }

  private getCardName() {
    return this.adyenPaymentMethod.card?.display_brand || "card";
  }

  toSaleorWebhookResponse(): Paymentmethoddetails {
    const type = this.adyenPaymentMethod.type;

    if (type === "card") {
      return {
        type: "CARD",
        name: this.getCardName(),
        brand: this.adyenPaymentMethod.card?.brand,
        lastDigits: this.adyenPaymentMethod.card?.last4,
        expMonth: this.adyenPaymentMethod.card?.exp_month,
        expYear: this.adyenPaymentMethod.card?.exp_year,
      };
    }

    return {
      type: "OTHER",
      name: this.adyenPaymentMethod.type,
    };
  }

  toSaleorTransactionEventPayload(): PaymentMethodDetailsInput {
    const type = this.adyenPaymentMethod.type;

    if (type === "card") {
      return {
        card: {
          brand: this.adyenPaymentMethod.card?.brand,
          name: this.getCardName(),
          lastDigits: this.adyenPaymentMethod.card?.last4,
          expMonth: this.adyenPaymentMethod.card?.exp_month,
          expYear: this.adyenPaymentMethod.card?.exp_year,
        },
      };
    }

    return {
      other: {
        name: this.adyenPaymentMethod.type,
      },
    };
  }
}
