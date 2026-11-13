import { ObservabilityAttributes } from "@saleor/apps-otel/src/observability-attributes";
import { err, ok, type Result } from "neverthrow";
import { after } from "next/server";

import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
  type MalformedRequestResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type TransactionChargeRequestedEventFragment } from "@/generated/graphql";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { loggerContext } from "@/lib/logger-context";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type AdyenProblemReporter } from "@/modules/app-problems";
import { resolveSaleorMoneyFromAdyenPaymentIntent } from "@/modules/saleor/resolve-saleor-money-from-adyen-payment-intent";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import {
  getChannelIdFromRequestedEventPayload,
  getIdempotencyKeyFromRequestedEventPayload,
  getTransactionFromRequestedEventPayload,
} from "@/modules/saleor/transaction-requested-event-helpers";
import { getSaleorOrderAdyenMetadata } from "@/modules/adyen/saleor-order-adyen-metadata";
import { mapAdyenErrorToApiError } from "@/modules/adyen/adyen-api-error";
import { createAdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";
import { type IAdyenPaymentIntentsApiFactory } from "@/modules/adyen/types";
import { ChargeFailureResult } from "@/modules/transaction-result/failure-result";
import { ChargeSuccessResult } from "@/modules/transaction-result/success-result";

import {
  TransactionChargeRequestedUseCaseResponses,
  type TransactionChargeRequestedUseCaseResponsesType,
} from "./use-case-response";

type UseCaseExecuteResult = Result<
  TransactionChargeRequestedUseCaseResponsesType,
  AppIsNotConfiguredResponse | BrokenAppResponse | MalformedRequestResponse
>;

export class TransactionChargeRequestedUseCase {
  private logger = createLogger("TransactionChargeRequestedUseCase");
  private appConfigRepo: AppConfigRepo;
  private adyenPaymentIntentsApiFactory: IAdyenPaymentIntentsApiFactory;

  constructor(deps: {
    appConfigRepo: AppConfigRepo;
    adyenPaymentIntentsApiFactory: IAdyenPaymentIntentsApiFactory;
  }) {
    this.appConfigRepo = deps.appConfigRepo;
    this.adyenPaymentIntentsApiFactory = deps.adyenPaymentIntentsApiFactory;
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionChargeRequestedEventFragment;
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

    const adyenPaymentIntentsApi = this.adyenPaymentIntentsApiFactory.create({
      key: restrictedKey,
    });

    this.logger.debug("Capturing Adyen payment intent with id", {
      id: transaction.pspReference,
    });

    const paymentIntentIdResult = createAdyenPaymentIntentId(transaction.pspReference);

    const capturePaymentIntentResult = await adyenPaymentIntentsApi.capturePaymentIntent({
      id: paymentIntentIdResult,
      idempotencyKey: getIdempotencyKeyFromRequestedEventPayload(event),
      metadata: getSaleorOrderAdyenMetadata(transaction),
    });

    if (capturePaymentIntentResult.isErr()) {
      const error = mapAdyenErrorToApiError(capturePaymentIntentResult.error);

      const config = {
        id: adyenConfigForThisChannel.value.id,
        name: adyenConfigForThisChannel.value.name,
      };

      after(() => args.problemReporter.reportApiProblem(error, config));

      this.logger.warn("Failed to capture payment intent", {
        error,
      });

      return ok(
        new TransactionChargeRequestedUseCaseResponses.Failure({
          transactionResult: new ChargeFailureResult(),
          adyenPaymentIntentId: paymentIntentIdResult,
          error,
          appContext: appContextContainer.getContextValue(),
        }),
      );
    }

    const saleorMoneyResult = resolveSaleorMoneyFromAdyenPaymentIntent(
      capturePaymentIntentResult.value,
    );

    if (saleorMoneyResult.isErr()) {
      this.logger.error("Failed to create Saleor money", {
        error: saleorMoneyResult.error,
      });

      return err(
        new BrokenAppResponse(appContextContainer.getContextValue(), saleorMoneyResult.error),
      );
    }

    const saleorMoney = saleorMoneyResult.value;

    return ok(
      new TransactionChargeRequestedUseCaseResponses.Success({
        transactionResult: new ChargeSuccessResult(),
        adyenPaymentIntentId: paymentIntentIdResult,
        saleorMoney,
        appContext: appContextContainer.getContextValue(),
      }),
    );
  }
}
