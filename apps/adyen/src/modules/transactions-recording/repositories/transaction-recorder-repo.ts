import { type Result } from "neverthrow";

import { BaseError } from "@/lib/errors";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";
import { type RecordedTransaction } from "@/modules/transactions-recording/domain/recorded-transaction";

export const TransactionRecorderError = {
  PersistenceNotAvailable: BaseError.subclass(
    "TransactionRecorderRepo.PersistenceNotAvailableError",
    {
      props: {
        _internalName: "TransactionRecorderRepo.PersistenceNotAvailableError",
      },
    },
  ),
  /**
   * Current assumption is that transaction MUST exist before reading it.
   * If not, it's something wrong with the business logic - that's why it's not null, but error
   */
  TransactionMissingError: BaseError.subclass("TransactionRecorderRepo.TransactionMissingError", {
    props: {
      _internalName: "TransactionRecorderRepo.TransactionMissingError",
    },
  }),
  FailedWritingTransactionError: BaseError.subclass(
    "TransactionRecorderRepo.FailedWritingTransactionError",
    {
      props: {
        _internalName: "TransactionRecorderRepo.FailedWritingTransactionError",
      },
    },
  ),
  FailedFetchingTransactionError: BaseError.subclass(
    "TransactionRecorderRepo.FailedFetchingTransactionError",
    {
      props: {
        _internalName: "TransactionRecorderRepo.FailedFetchingTransactionError",
      },
    },
  ),
};

export type TransactionRecorderError = InstanceType<
  | typeof TransactionRecorderError.PersistenceNotAvailable
  | typeof TransactionRecorderError.TransactionMissingError
  | typeof TransactionRecorderError.FailedWritingTransactionError
  | typeof TransactionRecorderError.FailedFetchingTransactionError
>;

export type TransactionRecorderRepoAccess = {
  saleorApiUrl: SaleorApiUrl;
  appId: string;
};

export interface TransactionRecorderRepo {
  recordTransaction(
    accessPattern: TransactionRecorderRepoAccess,
    transaction: RecordedTransaction,
  ): Promise<Result<null, TransactionRecorderError>>;

  getTransactionByAdyenPaymentIntentId(
    accessPattern: TransactionRecorderRepoAccess,
    id: AdyenPaymentIntentId,
  ): Promise<Result<RecordedTransaction, TransactionRecorderError>>;
}
