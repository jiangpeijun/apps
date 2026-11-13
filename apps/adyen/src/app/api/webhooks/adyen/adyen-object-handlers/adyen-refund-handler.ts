import { err, ok, type Result } from "neverthrow";
import type Adyen from "adyen";

import { BaseError } from "@/lib/errors";
import { loggerContext } from "@/lib/logger-context";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { SaleorMoney } from "@/modules/saleor/saleor-money";
import { generateRefundAdyenDashboardUrl } from "@/modules/adyen/generate-adyen-dashboard-urls";
import { type AdyenEnv } from "@/modules/adyen/adyen-env";
import {
  createAdyenPaymentIntentId,
  type AdyenPaymentIntentId,
} from "@/modules/adyen/adyen-payment-intent-id";
import { createAdyenRefundId } from "@/modules/adyen/adyen-refund-id";
import { createAdyenRefundStatus } from "@/modules/adyen/adyen-refund-status";
import { createTimestampFromAdyenEvent } from "@/modules/adyen/adyen-timestamps";
import { mapRefundStatusToTransactionResult } from "@/modules/transaction-result/map-refund-status-to-transaction-result";
import {
  type TransactionRecorderError,
  type TransactionRecorderRepo,
} from "@/modules/transactions-recording/repositories/transaction-recorder-repo";

import { TransactionEventReportVariablesResolver } from "../transaction-event-report-variables-resolver";

export type AdyenChargeHandlerSupportedEvents = Adyen.ChargeRefundUpdatedEvent;

type PossibleErrors =
  | InstanceType<
      | typeof SaleorMoney.ValidationError
      | typeof AdyenRefundHandler.NotSupportedEventError
      | typeof AdyenRefundHandler.MalformedEventError
    >
  | TransactionRecorderError;

export class AdyenRefundHandler {
  static NotSupportedEventError = BaseError.subclass("NotSupportedEventError", {
    props: {
      _internalName: "AdyenRefundHandler.NotSupportedEventError" as const,
    },
  });

  static MalformedEventError = BaseError.subclass("MalformedEventError", {
    props: {
      _internalName: "AdyenRefundHandler.MalformedEventError" as const,
    },
  });

  private prepareTransactionEventReportParams(event: AdyenChargeHandlerSupportedEvents) {
    const chargeObject = event.data.object;
    const currency = chargeObject.currency;
    const timestamp = createTimestampFromAdyenEvent(event);

    const saleorMoneyResult = SaleorMoney.createFromAdyen({
      amount: chargeObject.amount,
      currency,
    });

    if (saleorMoneyResult.isErr()) {
      return err(saleorMoneyResult.error);
    }

    return ok({
      saleorMoney: saleorMoneyResult.value,
      timestamp,
    });
  }

  private resolvePaymentIntentId(refund: Adyen.Refund) {
    const paymentIntentId = refund.payment_intent;

    if (!paymentIntentId) {
      return err(
        new AdyenRefundHandler.MalformedEventError("Refund event does not contain payment_intent"),
      );
    }

    if (typeof paymentIntentId !== "string") {
      return ok(createAdyenPaymentIntentId(paymentIntentId.id));
    }

    return ok(createAdyenPaymentIntentId(paymentIntentId));
  }

  private async resolveTransactionRecord({
    transactionRecorder,
    adyenPaymentIntentId,
    appId,
    saleorApiUrl,
  }: {
    transactionRecorder: TransactionRecorderRepo;
    adyenPaymentIntentId: AdyenPaymentIntentId;
    appId: string;
    saleorApiUrl: SaleorApiUrl;
  }) {
    const recordedTransactionResult =
      await transactionRecorder.getTransactionByAdyenPaymentIntentId(
        {
          appId,
          saleorApiUrl,
        },
        adyenPaymentIntentId,
      );

    if (recordedTransactionResult.isErr()) {
      return err(recordedTransactionResult.error);
    }

    loggerContext.setSaleorVersion(recordedTransactionResult.value.saleorSchemaVersion);

    return ok(recordedTransactionResult.value);
  }

  private checkIfEventIsSupported(
    event: Adyen.Event,
  ): event is AdyenChargeHandlerSupportedEvents {
    return event.type === "charge.refund.updated";
  }

  async processRefundEvent({
    event,
    adyenEnv,
    transactionRecorder,
    appId,
    saleorApiUrl,
  }: {
    event: Adyen.Event;
    adyenEnv: AdyenEnv;
    transactionRecorder: TransactionRecorderRepo;
    appId: string;
    saleorApiUrl: SaleorApiUrl;
  }): Promise<Result<TransactionEventReportVariablesResolver, PossibleErrors>> {
    if (!this.checkIfEventIsSupported(event)) {
      return err(new AdyenRefundHandler.NotSupportedEventError("Unsupported event type"));
    }

    const adyenPaymentIntentIdResult = this.resolvePaymentIntentId(event.data.object);

    if (adyenPaymentIntentIdResult.isErr()) {
      return err(adyenPaymentIntentIdResult.error);
    }

    const recordedTransactionResult = await this.resolveTransactionRecord({
      transactionRecorder,
      adyenPaymentIntentId: adyenPaymentIntentIdResult.value,
      appId,
      saleorApiUrl,
    });

    if (recordedTransactionResult.isErr()) {
      return err(recordedTransactionResult.error);
    }

    const paramsResult = this.prepareTransactionEventReportParams(event);

    if (paramsResult.isErr()) {
      return err(paramsResult.error);
    }

    const { saleorMoney, timestamp } = paramsResult.value;

    const refundId = createAdyenRefundId(event.data.object.id);

    switch (event.type) {
      case "charge.refund.updated": {
        return ok(
          new TransactionEventReportVariablesResolver({
            transactionResult: mapRefundStatusToTransactionResult(
              createAdyenRefundStatus(event.data.object.status),
            ),
            adyenObjectId: refundId,
            saleorTransactionId: recordedTransactionResult.value.saleorTransactionId,
            saleorMoney,
            timestamp,
            externalUrl: generateRefundAdyenDashboardUrl(refundId, adyenEnv),
            paymentMethodDetails: null, // there is no payment method details in refund event
          }),
        );
      }
    }
  }
}
