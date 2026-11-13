import { ObservabilityAttributes } from "@saleor/apps-otel/src/observability-attributes";
import { captureException } from "@sentry/nextjs";
import { err, ok, type Result } from "neverthrow";
import { after } from "next/server";

import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
  MalformedRequestResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type TransactionProcessSessionEventFragment } from "@/generated/graphql";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { loggerContext } from "@/lib/logger-context";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type AdyenProblemReporter } from "@/modules/app-problems";
import { type ResolvedTransactionFlow } from "@/modules/resolved-transaction-flow";
import { resolveSaleorMoneyFromAdyenPaymentIntent } from "@/modules/saleor/resolve-saleor-money-from-adyen-payment-intent";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { SaleorPaymentMethodDetails } from "@/modules/saleor/saleor-payment-method-details";
import { mapAdyenErrorToApiError } from "@/modules/adyen/adyen-api-error";
import { createAdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";
import { createAdyenPaymentIntentStatus } from "@/modules/adyen/adyen-payment-intent-status";
import { createTimestampFromPaymentIntent } from "@/modules/adyen/adyen-timestamps";
import { type IAdyenPaymentIntentsApiFactory } from "@/modules/adyen/types";
import {
  AuthorizationFailureResult,
  ChargeFailureResult,
} from "@/modules/transaction-result/failure-result";
import { mapPaymentIntentStatusToTransactionResult } from "@/modules/transaction-result/map-payment-intent-status-to-transaction-result";
import { type TransactionRecorderRepo } from "@/modules/transactions-recording/repositories/transaction-recorder-repo";

import {
  TransactionProcessSessionUseCaseResponses,
  type TransactionProcessSessionUseCaseResponsesType,
} from "./use-case-response";

type UseCaseExecuteResult = Result<
  TransactionProcessSessionUseCaseResponsesType,
  AppIsNotConfiguredResponse | BrokenAppResponse | MalformedRequestResponse
>;

export class TransactionProcessSessionUseCase {
  private logger = createLogger("TransactionProcessSessionUseCase");
  private appConfigRepo: AppConfigRepo;
  private adyenPaymentIntentsApiFactory: IAdyenPaymentIntentsApiFactory;
  private transactionRecorder: TransactionRecorderRepo;

  constructor(deps: {
    appConfigRepo: AppConfigRepo;
    adyenPaymentIntentsApiFactory: IAdyenPaymentIntentsApiFactory;
    transactionRecorder: TransactionRecorderRepo;
  }) {
    this.appConfigRepo = deps.appConfigRepo;
    this.adyenPaymentIntentsApiFactory = deps.adyenPaymentIntentsApiFactory;
    this.transactionRecorder = deps.transactionRecorder;
  }

  private getFailureAppResult(resolvedTransactionFlow: ResolvedTransactionFlow) {
    if (resolvedTransactionFlow === "CHARGE") {
      return new ChargeFailureResult();
    }

    return new AuthorizationFailureResult();
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionProcessSessionEventFragment;
    problemReporter: AdyenProblemReporter;
  }): Promise<UseCaseExecuteResult> {
    const { appId, saleorApiUrl, event } = args;

    loggerContext.set(ObservabilityAttributes.PSP_REFERENCE, event.transaction.pspReference);

    const adyenConfigForThisChannel = await this.appConfigRepo.getAdyenConfig({
      channelId: event.sourceObject.channel.id,
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
        channelId: event.sourceObject.channel.id,
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

    const paymentIntentIdResult = createAdyenPaymentIntentId(event.transaction.pspReference);

    const getPaymentIntentResult = await adyenPaymentIntentsApi.getPaymentIntent({
      id: paymentIntentIdResult,
    });

    const recordedTransactionResult =
      await this.transactionRecorder.getTransactionByAdyenPaymentIntentId(
        {
          appId: args.appId,
          saleorApiUrl: args.saleorApiUrl,
        },
        paymentIntentIdResult,
      );

    if (recordedTransactionResult.isErr()) {
      this.logger.error("Failed to get recorded transaction", {
        error: recordedTransactionResult.error,
      });

      return err(
        new MalformedRequestResponse(
          appContextContainer.getContextValue(),
          recordedTransactionResult.error,
        ),
      );
    }

    if (getPaymentIntentResult.isErr()) {
      const error = mapAdyenErrorToApiError(getPaymentIntentResult.error);

      const config = {
        id: adyenConfigForThisChannel.value.id,
        name: adyenConfigForThisChannel.value.name,
      };

      after(() => args.problemReporter.reportApiProblem(error, config));

      this.logger.warn("Failed to get payment intent", {
        error,
      });

      return ok(
        new TransactionProcessSessionUseCaseResponses.Failure({
          error,
          transactionResult: this.getFailureAppResult(
            recordedTransactionResult.value.resolvedTransactionFlow,
          ),
          adyenPaymentIntentId: paymentIntentIdResult,
          appContext: appContextContainer.getContextValue(),
        }),
      );
    }

    const saleorMoneyResult = resolveSaleorMoneyFromAdyenPaymentIntent(
      getPaymentIntentResult.value,
    );

    if (saleorMoneyResult.isErr()) {
      captureException(saleorMoneyResult.error);

      this.logger.error("Failed to create Saleor Money from Adyen getPaymentIntent call", {
        error: saleorMoneyResult.error,
      });

      return err(
        new BrokenAppResponse(appContextContainer.getContextValue(), saleorMoneyResult.error),
      );
    }

    return ok(
      new TransactionProcessSessionUseCaseResponses.Success({
        transactionResult: mapPaymentIntentStatusToTransactionResult(
          createAdyenPaymentIntentStatus(getPaymentIntentResult.value.status),
          recordedTransactionResult.value.resolvedTransactionFlow,
        ),
        adyenPaymentIntentId: paymentIntentIdResult,
        saleorMoney: saleorMoneyResult.value,
        timestamp: createTimestampFromPaymentIntent(getPaymentIntentResult.value),
        appContext: appContextContainer.getContextValue(),
        saleorPaymentMethodDetails: SaleorPaymentMethodDetails.createFromAdyen(
          getPaymentIntentResult.value.payment_method,
        ).unwrapOr(null),
      }),
    );
  }
}
