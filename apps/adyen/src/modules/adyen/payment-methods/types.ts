import type Adyen from "adyen";

import { type ResolvedTransactionFlow } from "@/modules/resolved-transaction-flow";
import { type SaleorTransationFlow } from "@/modules/saleor/saleor-transaction-flow";

export interface PaymentMethod {
  type: keyof Adyen.PaymentIntent.PaymentMethodOptions;
  getResolvedTransactionFlow(saleorTransactionFlow: SaleorTransationFlow): ResolvedTransactionFlow;
  getCreatePaymentIntentMethodOptions(
    saleorTransactionFlow: SaleorTransationFlow,
  ): Adyen.PaymentIntentCreateParams.PaymentMethodOptions;
}
