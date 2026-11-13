import { err, ok, type Result } from "neverthrow";

import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";
import { type RecordedTransaction } from "@/modules/transactions-recording/domain/recorded-transaction";
import {
  TransactionRecorderError,
  type TransactionRecorderRepo,
  type TransactionRecorderRepoAccess,
} from "@/modules/transactions-recording/repositories/transaction-recorder-repo";

export class MockedTransactionRecorder implements TransactionRecorderRepo {
  public transactions: Record<string, RecordedTransaction> = {};

  async recordTransaction(
    _accessPattern: TransactionRecorderRepoAccess,
    transaction: RecordedTransaction,
  ): Promise<Result<null, TransactionRecorderError>> {
    this.transactions[transaction.adyenPaymentIntentId] = transaction;

    return ok(null);
  }

  async getTransactionByAdyenPaymentIntentId(
    _accessPattern: TransactionRecorderRepoAccess,
    id: AdyenPaymentIntentId,
  ): Promise<Result<RecordedTransaction, TransactionRecorderError>> {
    const transaction = this.transactions[id];

    if (transaction) {
      return ok(transaction);
    } else {
      return err(new TransactionRecorderError.TransactionMissingError("Transaction not found"));
    }
  }

  reset() {
    this.transactions = {};
  }
}
