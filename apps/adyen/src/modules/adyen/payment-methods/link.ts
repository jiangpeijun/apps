import type Adyen from "adyen";
import { z } from "zod";

import {
  createResolvedTransactionFlow,
  type ResolvedTransactionFlow,
} from "@/modules/resolved-transaction-flow";
import { type SaleorTransationFlow } from "@/modules/saleor/saleor-transaction-flow";

import { type PaymentMethod } from "./types";

/**
 * https://docs.adyen.com/payments/link
 */
export class LinkPaymentMethod implements PaymentMethod {
  type = "link" as const;

  static TransactionInitializeSchema = z
    .object({
      paymentMethod: z.literal("link"),
    })
    .strict();

  // Link supports both AUTHORIZATION and CHARGE - hence we return the same value we get from SaleorTransationFlow
  getResolvedTransactionFlow(saleorTransactionFlow: SaleorTransationFlow): ResolvedTransactionFlow {
    return createResolvedTransactionFlow(saleorTransactionFlow);
  }

  getCreatePaymentIntentMethodOptions(
    saleorTransactionFlow: SaleorTransationFlow,
  ): Adyen.PaymentIntentCreateParams.PaymentMethodOptions {
    const transactionFlow = this.getResolvedTransactionFlow(saleorTransactionFlow);

    return {
      link: {
        /*
         * override `capture_method` only for link payment method - so storefront does not need to
         * implement different logic for AUTHORIZATION and CHARGE
         */
        capture_method: transactionFlow === "AUTHORIZATION" ? "manual" : undefined,
      },
    };
  }
}
