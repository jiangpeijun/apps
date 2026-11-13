import { type SaleorSchemaVersion } from "@saleor/app-sdk/types";

import { type SaleorTransationId } from "@/modules/saleor/saleor-transaction-id";
import { type PaymentMethod } from "@/modules/adyen/payment-methods/types";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";

import { type ResolvedTransactionFlow } from "../../resolved-transaction-flow";
import { type SaleorTransationFlow } from "../../saleor/saleor-transaction-flow";

/**
 * Holds transaction that app records during it's lifetime.
 * Usually it's mainly used for persisting pair of Saleor reference (Transaction ID) and Adyen reference (PaymentIntent ID).
 *
 * TODO: Persistence should not allow overwrites - it's invariant if we try to save the same data twice
 */
export class RecordedTransaction {
  readonly saleorTransactionId: SaleorTransationId;
  readonly adyenPaymentIntentId: AdyenPaymentIntentId;
  readonly saleorTransactionFlow: SaleorTransationFlow;
  readonly resolvedTransactionFlow: ResolvedTransactionFlow;
  readonly selectedPaymentMethod: PaymentMethod["type"];
  readonly saleorSchemaVersion: SaleorSchemaVersion;

  constructor(args: {
    saleorTransactionId: SaleorTransationId;
    adyenPaymentIntentId: AdyenPaymentIntentId;
    saleorTransactionFlow: SaleorTransationFlow;
    resolvedTransactionFlow: ResolvedTransactionFlow;
    selectedPaymentMethod: PaymentMethod["type"];
    saleorSchemaVersion: SaleorSchemaVersion;
  }) {
    this.saleorTransactionId = args.saleorTransactionId;
    this.adyenPaymentIntentId = args.adyenPaymentIntentId;
    this.saleorTransactionFlow = args.saleorTransactionFlow;
    this.resolvedTransactionFlow = args.resolvedTransactionFlow;
    this.selectedPaymentMethod = args.selectedPaymentMethod;
    this.saleorSchemaVersion = args.saleorSchemaVersion;
  }
}
