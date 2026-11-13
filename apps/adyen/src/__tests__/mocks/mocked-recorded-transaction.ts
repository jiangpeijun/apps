import { type SaleorSchemaVersion } from "@saleor/app-sdk/types";

import {
  mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
  mockedSaleorTransactionId,
} from "@/__tests__/mocks/constants";
import { mockedAdyenPaymentIntentId } from "@/__tests__/mocks/mocked-adyen-payment-intent-id";
import {
  createResolvedTransactionFlow,
  type ResolvedTransactionFlow,
} from "@/modules/resolved-transaction-flow";
import {
  createSaleorTransactionFlow,
  type SaleorTransationFlow,
} from "@/modules/saleor/saleor-transaction-flow";
import { type SaleorTransationId } from "@/modules/saleor/saleor-transaction-id";
import { type PaymentMethod } from "@/modules/adyen/payment-methods/types";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";
import { RecordedTransaction } from "@/modules/transactions-recording/domain/recorded-transaction";

type Params = {
  saleorTransactionId?: SaleorTransationId;
  adyenPaymentIntentId?: AdyenPaymentIntentId;
  selectedPaymentMethod?: PaymentMethod["type"];
  resolvedTransactionFlow?: ResolvedTransactionFlow;
  saleorTransactionFlow?: SaleorTransationFlow;
  saleorSchemaVersion?: SaleorSchemaVersion;
};

export const getMockedRecordedTransaction = (params?: Params): RecordedTransaction => {
  const finalParams = {
    saleorTransactionId: mockedSaleorTransactionId,
    adyenPaymentIntentId: mockedAdyenPaymentIntentId,
    saleorTransactionFlow: createSaleorTransactionFlow("CHARGE"),
    resolvedTransactionFlow: createResolvedTransactionFlow("CHARGE"),
    selectedPaymentMethod: "card",
    saleorSchemaVersion: mockedSaleorSchemaVersionSupportingPaymentMethodDetails,
    ...(params ?? {}),
  } satisfies Params;

  return new RecordedTransaction({
    saleorTransactionId: finalParams.saleorTransactionId,
    adyenPaymentIntentId: finalParams.adyenPaymentIntentId,
    saleorTransactionFlow: finalParams.saleorTransactionFlow,
    resolvedTransactionFlow: finalParams.resolvedTransactionFlow,
    selectedPaymentMethod: finalParams.selectedPaymentMethod,
    saleorSchemaVersion: finalParams.saleorSchemaVersion,
  });
};
