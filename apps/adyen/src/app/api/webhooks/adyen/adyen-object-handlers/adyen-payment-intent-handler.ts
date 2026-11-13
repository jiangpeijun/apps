import { err, ok, type Result } from "neverthrow";
import type Adyen from "adyen";

import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { loggerContext } from "@/lib/logger-context";
import { resolveSaleorMoneyFromAdyenPaymentIntent } from "@/modules/saleor/resolve-saleor-money-from-adyen-payment-intent";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { type SaleorMoney } from "@/modules/saleor/saleor-money";
import { SaleorPaymentMethodDetails } from "@/modules/saleor/saleor-payment-method-details";
import { generatePaymentIntentAdyenDashboardUrl } from "@/modules/adyen/generate-adyen-dashboard-urls";
import { type AdyenEnv } from "@/modules/adyen/adyen-env";
import {
  createAdyenPaymentIntentId,
  type AdyenPaymentIntentId,
} from "@/modules/adyen/adyen-payment-intent-id";
import { createAdyenPaymentIntentStatus } from "@/modules/adyen/adyen-payment-intent-status";
import { createTimestampFromAdyenEvent } from "@/modules/adyen/adyen-timestamps";
import { type IAdyenPaymentIntentsApi } from "@/modules/adyen/types";
import { CancelSuccessResult } from "@/modules/transaction-result/cancel-result";
import {
  AuthorizationFailureResult,
  ChargeFailureResult,
} from "@/modules/transaction-result/failure-result";
import { mapPaymentIntentStatusToTransactionResult } from "@/modules/transaction-result/map-payment-intent-status-to-transaction-result";
import {
  type TransactionRecorderError,
  type TransactionRecorderRepo,
} from "@/modules/transactions-recording/repositories/transaction-recorder-repo";

import { TransactionEventReportVariablesResolver } from "../transaction-event-report-variables-resolver";

export type AdyenPaymentIntentHandlerSupportedEvents =
  | Adyen.PaymentIntentSucceededEvent
  | Adyen.PaymentIntentProcessingEvent
  | Adyen.PaymentIntentRequiresActionEvent
  | Adyen.PaymentIntentAmountCapturableUpdatedEvent
  | Adyen.PaymentIntentPaymentFailedEvent
  | Adyen.PaymentIntentCanceledEvent;

type PossibleErrors =
  | InstanceType<
      | typeof SaleorMoney.ValidationError
      | typeof AdyenPaymentIntentHandler.NotSupportedEventError
      | typeof AdyenPaymentIntentHandler.MalformedEventError
    >
  | TransactionRecorderError;

export class AdyenPaymentIntentHandler {
  static NotSupportedEventError = BaseError.subclass("NotSupportedEventError", {
    props: {
      _internalName: "AdyenPaymentIntentHandler.NotSupportedEventError" as const,
    },
  });

  static MalformedEventError = BaseError.subclass("MalformedEventError", {
    props: {
      _internalName: "AdyenPaymentIntentHandler.MalformedEventError" as const,
    },
  });

  logger = createLogger("AdyenPaymentIntentHandler");

  private prepareTransactionEventReportParams(event: AdyenPaymentIntentHandlerSupportedEvents) {
    const timestamp = createTimestampFromAdyenEvent(event);

    const paymentIntentStatus = createAdyenPaymentIntentStatus(event.data.object.status);

    const saleorMoneyResult = resolveSaleorMoneyFromAdyenPaymentIntent(event.data.object);

    if (saleorMoneyResult.isErr()) {
      return err(saleorMoneyResult.error);
    }

    return ok({
      saleorMoney: saleorMoneyResult.value,
      paymentIntentStatus,
      timestamp,
    });
  }

  private checkIfEventIsSupported(
    event: Adyen.Event,
  ): event is AdyenPaymentIntentHandlerSupportedEvents {
    return (
      event.type === "payment_intent.succeeded" ||
      event.type === "payment_intent.processing" ||
      event.type === "payment_intent.requires_action" ||
      event.type === "payment_intent.amount_capturable_updated" ||
      event.type === "payment_intent.payment_failed" ||
      event.type === "payment_intent.canceled"
    );
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

  private async getPaymentMethodDetails(
    adyenPaymentIntentsApi: IAdyenPaymentIntentsApi,
    paymentIntentId: AdyenPaymentIntentId,
  ): Promise<SaleorPaymentMethodDetails | null> {
    const getPaymentIntentResult = await adyenPaymentIntentsApi.getPaymentIntent({
      id: paymentIntentId,
    });

    if (getPaymentIntentResult.isErr()) {
      this.logger.warn(
        "Failed to fetch payment intent details - falling back to null as payment method details",
        {
          error: getPaymentIntentResult.error,
        },
      );

      return null;
    }

    const paymentMethodDetailsResult = SaleorPaymentMethodDetails.createFromAdyen(
      getPaymentIntentResult.value.payment_method,
    );

    if (paymentMethodDetailsResult.isErr()) {
      this.logger.warn(
        "Failed to create payment method details from Adyen payment method - falling back to null",
        { error: paymentMethodDetailsResult.error },
      );

      return null;
    }

    return paymentMethodDetailsResult.value;
  }

  async processPaymentIntentEvent({
    event,
    adyenEnv,
    transactionRecorder,
    appId,
    saleorApiUrl,
    adyenPaymentIntentsApi,
  }: {
    event: Adyen.Event;
    adyenEnv: AdyenEnv;
    transactionRecorder: TransactionRecorderRepo;
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    adyenPaymentIntentsApi: IAdyenPaymentIntentsApi;
  }): Promise<Result<TransactionEventReportVariablesResolver, PossibleErrors>> {
    if (!this.checkIfEventIsSupported(event)) {
      return err(new AdyenPaymentIntentHandler.NotSupportedEventError("Unsupported event type"));
    }

    const adyenPaymentIntentId = createAdyenPaymentIntentId(event.data.object.id);

    const recordedTransactionResult = await this.resolveTransactionRecord({
      transactionRecorder,
      adyenPaymentIntentId,
      appId,
      saleorApiUrl,
    });

    if (recordedTransactionResult.isErr()) {
      return err(recordedTransactionResult.error);
    }

    const { resolvedTransactionFlow, saleorTransactionId } = recordedTransactionResult.value;

    const paramsResult = this.prepareTransactionEventReportParams(event);

    if (paramsResult.isErr()) {
      return err(paramsResult.error);
    }

    const { saleorMoney, paymentIntentStatus, timestamp } = paramsResult.value;

    const externalUrl = generatePaymentIntentAdyenDashboardUrl(adyenPaymentIntentId, adyenEnv);

    const paymentMethodDetails = await this.getPaymentMethodDetails(
      adyenPaymentIntentsApi,
      adyenPaymentIntentId,
    );

    switch (event.type) {
      case "payment_intent.succeeded":
      case "payment_intent.processing":
      case "payment_intent.requires_action":
      case "payment_intent.amount_capturable_updated": {
        return ok(
          new TransactionEventReportVariablesResolver({
            saleorMoney,
            transactionResult: mapPaymentIntentStatusToTransactionResult(
              paymentIntentStatus,
              resolvedTransactionFlow,
            ),
            timestamp,
            saleorTransactionId,
            adyenObjectId: adyenPaymentIntentId,
            externalUrl,
            paymentMethodDetails,
          }),
        );
      }

      case "payment_intent.payment_failed": {
        const failureResult =
          resolvedTransactionFlow === "AUTHORIZATION"
            ? new AuthorizationFailureResult()
            : new ChargeFailureResult();

        return ok(
          new TransactionEventReportVariablesResolver({
            saleorMoney,
            transactionResult: failureResult,
            timestamp,
            saleorTransactionId,
            adyenObjectId: adyenPaymentIntentId,
            externalUrl,
            paymentMethodDetails,
          }),
        );
      }

      case "payment_intent.canceled": {
        return ok(
          new TransactionEventReportVariablesResolver({
            transactionResult: new CancelSuccessResult(),
            saleorMoney,
            timestamp,
            saleorTransactionId,
            adyenObjectId: adyenPaymentIntentId,
            externalUrl,
            paymentMethodDetails,
          }),
        );
      }
    }
  }
}
