import { ObservabilityAttributes } from "@saleor/apps-otel/src/observability-attributes";
import { err, ok, type Result } from "neverthrow";
import { after } from "next/server";

import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
  MalformedRequestResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type TransactionRefundRequestedEventFragment } from "@/generated/graphql";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { loggerContext } from "@/lib/logger-context";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type AdyenProblemReporter } from "@/modules/app-problems";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { SaleorMoney } from "@/modules/saleor/saleor-money";
import { createSaleorTransactionId } from "@/modules/saleor/saleor-transaction-id";
import {
  getChannelIdFromRequestedEventPayload,
  getIdempotencyKeyFromRequestedEventPayload,
  getTransactionFromRequestedEventPayload,
} from "@/modules/saleor/transaction-requested-event-helpers";
import { getSaleorOrderAdyenMetadata } from "@/modules/adyen/saleor-order-adyen-metadata";
import { mapAdyenErrorToApiError } from "@/modules/adyen/adyen-api-error";
import { AdyenMoney } from "@/modules/adyen/adyen-money";
import { createAdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";
import { createAdyenRefundId } from "@/modules/adyen/adyen-refund-id";
import { type IAdyenRefundsApiFactory } from "@/modules/adyen/types";
import { RefundFailureResult } from "@/modules/transaction-result/refund-result";

import {
  TransactionRefundRequestedUseCaseResponses,
  type TransactionRefundRequestedUseCaseResponsesType,
} from "./use-case-response";

type UseCaseExecuteResult = Result<
  TransactionRefundRequestedUseCaseResponsesType,
  AppIsNotConfiguredResponse | BrokenAppResponse | MalformedRequestResponse
>;

export class TransactionRefundRequestedUseCase {
  private logger = createLogger("TransactionRefundRequestedUseCase");
  private appConfigRepo: AppConfigRepo;
  private adyenRefundsApiFactory: IAdyenRefundsApiFactory;

  constructor(deps: {
    appConfigRepo: AppConfigRepo;
    adyenRefundsApiFactory: IAdyenRefundsApiFactory;
  }) {
    this.appConfigRepo = deps.appConfigRepo;
    this.adyenRefundsApiFactory = deps.adyenRefundsApiFactory;
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionRefundRequestedEventFragment;
    problemReporter: AdyenProblemReporter;
  }): Promise<UseCaseExecuteResult> {
    const { appId, saleorApiUrl, event } = args;

    const transaction = getTransactionFromRequestedEventPayload(event);
    const channelId = getChannelIdFromRequestedEventPayload(event);

    loggerContext.set(ObservabilityAttributes.PSP_REFERENCE, transaction.pspReference);

    const adyenConfigForThisChannel = await this.appConfigRepo.getAdyenConfig({
      channelId,
      appId,
      saleorApiUrl,
    });

    if (adyenConfigForThisChannel.isErr()) {
      this.logger.error("Failed to get configuration", {
        error: adyenConfigForThisChannel.error,
      });

      return err(
        new BrokenAppResponse(
          appContextContainer.getContextValue(),
          adyenConfigForThisChannel.error,
        ),
      );
    }

    if (!adyenConfigForThisChannel.value) {
      this.logger.warn("Config for channel not found", {
        channelId,
      });

      return err(
        new AppIsNotConfiguredResponse(
          appContextContainer.getContextValue(),
          new BaseError("Config for channel not found"),
        ),
      );
    }

    appContextContainer.set({
      adyenEnv: adyenConfigForThisChannel.value.getAdyenEnvValue(),
    });

    const restrictedKey = adyenConfigForThisChannel.value.restrictedKey;

    const adyenRefundsApi = this.adyenRefundsApiFactory.create({
      key: restrictedKey,
    });

    this.logger.debug("Refunding Adyen payment intent with id", {
      id: transaction.pspReference,
      action: event.action,
    });

    const adyenPaymentIntentId = createAdyenPaymentIntentId(transaction.pspReference);

    const adyenMoneyResult = AdyenMoney.createFromSaleorAmount({
      amount: event.action.amount,
      currency: event.action.currency,
    });

    if (adyenMoneyResult.isErr()) {
      this.logger.error("Failed to create Adyen money", {
        error: adyenMoneyResult.error,
      });

      return err(
        new MalformedRequestResponse(
          appContextContainer.getContextValue(),
          adyenMoneyResult.error,
        ),
      );
    }

    const createRefundResult = await adyenRefundsApi.createRefund({
      paymentIntentId: adyenPaymentIntentId,
      adyenMoney: adyenMoneyResult.value,
      idempotencyKey: getIdempotencyKeyFromRequestedEventPayload(event),
      metadata: {
        saleor_source_id: transaction.checkout?.id
          ? transaction.checkout.id
          : transaction.order?.id,
        saleor_source_type: transaction.checkout ? "Checkout" : "Order",
        saleor_transaction_id: createSaleorTransactionId(transaction.id),
        saleor_api_url: saleorApiUrl,
        saleor_app_id: appId,
        ...getSaleorOrderAdyenMetadata(transaction),
      },
    });

    if (createRefundResult.isErr()) {
      const error = mapAdyenErrorToApiError(createRefundResult.error);

      const config = {
        id: adyenConfigForThisChannel.value.id,
        name: adyenConfigForThisChannel.value.name,
      };

      after(() => args.problemReporter.reportApiProblem(error, config));

      this.logger.warn("Failed to create refund", {
        error,
      });

      return ok(
        new TransactionRefundRequestedUseCaseResponses.Failure({
          transactionResult: new RefundFailureResult(),
          adyenPaymentIntentId,
          error,
          appContext: appContextContainer.getContextValue(),
        }),
      );
    }

    const refund = createRefundResult.value;

    this.logger.debug("Refund created", {
      refund,
    });

    const saleorMoneyResult = SaleorMoney.createFromAdyen({
      amount: refund.amount,
      currency: refund.currency,
    });

    if (saleorMoneyResult.isErr()) {
      this.logger.error("Failed to create Saleor money", {
        error: saleorMoneyResult.error,
      });

      return err(
        new BrokenAppResponse(appContextContainer.getContextValue(), saleorMoneyResult.error),
      );
    }

    return ok(
      new TransactionRefundRequestedUseCaseResponses.Success({
        adyenRefundId: createAdyenRefundId(refund.id),
        appContext: appContextContainer.getContextValue(),
      }),
    );
  }
}
