import { type SaleorSchemaVersion } from "@saleor/app-sdk/types";
import { ObservabilityAttributes } from "@saleor/apps-otel/src/observability-attributes";
import { captureException } from "@sentry/nextjs";
import { err, fromThrowable, ok, Result } from "neverthrow";
import { after } from "next/server";
import type Adyen from "adyen";

import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
  MalformedRequestResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type TransactionInitializeSessionEventFragment } from "@/generated/graphql";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { loggerContext } from "@/lib/logger-context";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type AdyenProblemReporter } from "@/modules/app-problems";
import { type ResolvedTransactionFlow } from "@/modules/resolved-transaction-flow";
import { resolveSaleorMoneyFromAdyenPaymentIntent } from "@/modules/saleor/resolve-saleor-money-from-adyen-payment-intent";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { type SaleorMoney } from "@/modules/saleor/saleor-money";
import {
  createSaleorTransactionFlow,
  type SaleorTransationFlow,
} from "@/modules/saleor/saleor-transaction-flow";
import { createSaleorTransactionId } from "@/modules/saleor/saleor-transaction-id";
import {
  getSaleorOrderAdyenDescription,
  getSaleorOrderAdyenMetadata,
} from "@/modules/adyen/saleor-order-adyen-metadata";
import { mapAdyenErrorToApiError } from "@/modules/adyen/adyen-api-error";
import {
  createAdyenClientSecret,
  type AdyenClientSecret,
  type AdyenClientSecretValidationError,
} from "@/modules/adyen/adyen-client-secret";
import { AdyenMoney } from "@/modules/adyen/adyen-money";
import {
  createAdyenPaymentIntentId,
  type AdyenPaymentIntentId,
  type AdyenPaymentIntentValidationError,
} from "@/modules/adyen/adyen-payment-intent-id";
import {
  createAdyenPaymentIntentStatus,
  type AdyenPaymentIntentStatus,
} from "@/modules/adyen/adyen-payment-intent-status";
import {
  type CreatePaymentIntentArgs,
  type IAdyenPaymentIntentsApiFactory,
} from "@/modules/adyen/types";
import {
  AuthorizationActionRequiredResult,
  ChargeActionRequiredResult,
} from "@/modules/transaction-result/action-required-result";
import {
  AuthorizationFailureResult,
  ChargeFailureResult,
} from "@/modules/transaction-result/failure-result";
import { RecordedTransaction } from "@/modules/transactions-recording/domain/recorded-transaction";
import { type TransactionRecorderRepo } from "@/modules/transactions-recording/repositories/transaction-recorder-repo";

import {
  parseTransactionInitializeSessionEventData,
  type TransactionInitializeSessionEventData,
  UnsupportedPaymentMethodError,
} from "./event-data-parser";
import { resolvePaymentMethodFromEventData } from "./payment-method-resolver";
import {
  TransactionInitializeSessionUseCaseResponses,
  type TransactionInitializeSessionUseCaseResponsesType,
} from "./use-case-response";

type UseCaseExecuteResult = Result<
  TransactionInitializeSessionUseCaseResponsesType,
  AppIsNotConfiguredResponse | BrokenAppResponse | MalformedRequestResponse
>;

export class TransactionInitializeSessionUseCase {
  private logger = createLogger("TransactionInitializeSessionUseCase");
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

  private prepareAdyenCreatePaymentIntentParams(args: {
    event: TransactionInitializeSessionEventFragment;
    eventData: TransactionInitializeSessionEventData;
    selectedPaymentMethodOptions: Adyen.PaymentIntentCreateParams.PaymentMethodOptions;
    idempotencyKey: string;
    saleorApiUrl: SaleorApiUrl;
    appId: string;
  }): Result<CreatePaymentIntentArgs, InstanceType<typeof AdyenMoney.ValdationError>> {
    return AdyenMoney.createFromSaleorAmount({
      amount: args.event.action.amount,
      currency: args.event.action.currency,
    }).map((adyenMoney) => {
      const { sourceObject } = args.event;
      const order = sourceObject.__typename === "Order" ? sourceObject : null;
      const description = order ? getSaleorOrderAdyenDescription(order) : undefined;

      return {
        metadata: {
          saleor_source_id: sourceObject.id,
          saleor_source_type: sourceObject.__typename,
          saleor_transaction_id: createSaleorTransactionId(args.event.transaction.id),
          saleor_api_url: args.saleorApiUrl,
          saleor_app_id: args.appId,
          ...getSaleorOrderAdyenMetadata({
            order,
            checkout: sourceObject.__typename === "Checkout" ? sourceObject : null,
          }),
        },
        adyenMoney,
        idempotencyKey: args.idempotencyKey,
        intentParams: {
          /*
           * Enable all payment methods configured in the Adyen Dashboard.
           * The app validated if it allow payment method before.
           */
          automatic_payment_methods: {
            enabled: true,
          },
          payment_method_options: {
            ...args.selectedPaymentMethodOptions,
          },
          ...(description && { description }),
        },
      };
    });
  }

  private mapAdyenPaymentIntentToWebhookResponse(
    paymentIntent: Adyen.PaymentIntent,
  ): Result<
    [SaleorMoney, AdyenPaymentIntentId, AdyenClientSecret, AdyenPaymentIntentStatus],
    InstanceType<
      | typeof AdyenPaymentIntentValidationError
      | typeof SaleorMoney.ValidationError
      | typeof AdyenClientSecretValidationError
    >
  > {
    return Result.combine([
      resolveSaleorMoneyFromAdyenPaymentIntent(paymentIntent),
      fromThrowable(createAdyenPaymentIntentId)(paymentIntent.id),
      createAdyenClientSecret(paymentIntent.client_secret),
      fromThrowable(createAdyenPaymentIntentStatus)(paymentIntent.status),
    ]);
  }

  private resolveErrorTransactionResult(
    transactionFlow: ResolvedTransactionFlow | SaleorTransationFlow,
  ): ChargeFailureResult | AuthorizationFailureResult {
    if (transactionFlow === "AUTHORIZATION") {
      return new AuthorizationFailureResult();
    }

    return new ChargeFailureResult();
  }

  private resolveOkTransactionResult({
    transactionFlow,
    adyenStatus,
  }: {
    transactionFlow: ResolvedTransactionFlow;
    adyenStatus: AdyenPaymentIntentStatus;
  }): ChargeActionRequiredResult | AuthorizationActionRequiredResult {
    if (transactionFlow === "AUTHORIZATION") {
      return new AuthorizationActionRequiredResult(adyenStatus);
    }

    return new ChargeActionRequiredResult(adyenStatus);
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionInitializeSessionEventFragment;
    saleorSchemaVersion: SaleorSchemaVersion;
    problemReporter: AdyenProblemReporter;
  }): Promise<UseCaseExecuteResult> {
    const { appId, saleorApiUrl, event, saleorSchemaVersion } = args;

    const saleorTransactionFlow = createSaleorTransactionFlow(event.action.actionType);

    const eventDataResult = parseTransactionInitializeSessionEventData(event.data);

    if (eventDataResult.isErr()) {
      this.logger.warn("Failed to parse event data", { error: eventDataResult.error });

      if (eventDataResult.error instanceof UnsupportedPaymentMethodError) {
        after(() => {
          args.problemReporter.reportInvalidPaymentMethod(event.sourceObject.channel.slug);
        });
      }

      return ok(
        new TransactionInitializeSessionUseCaseResponses.Failure({
          transactionResult: this.resolveErrorTransactionResult(saleorTransactionFlow),
          error: eventDataResult.error,
          appContext: appContextContainer.getContextValue(),
        }),
      );
    }

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
          new BaseError("Config not found"),
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

    this.logger.debug("Creating Adyen payment intent with params", {
      params: args.event.action,
    });

    const selectedPaymentMethod = resolvePaymentMethodFromEventData(eventDataResult.value);

    const resolvedTransactionFlow =
      selectedPaymentMethod.getResolvedTransactionFlow(saleorTransactionFlow);

    const adyenPaymentIntentParamsResult = this.prepareAdyenCreatePaymentIntentParams({
      eventData: eventDataResult.value,
      event: event,
      selectedPaymentMethodOptions:
        selectedPaymentMethod.getCreatePaymentIntentMethodOptions(saleorTransactionFlow),
      idempotencyKey: event.idempotencyKey,
      saleorApiUrl,
      appId,
    });

    if (adyenPaymentIntentParamsResult.isErr()) {
      captureException(adyenPaymentIntentParamsResult.error);

      return err(
        new MalformedRequestResponse(
          appContextContainer.getContextValue(),
          adyenPaymentIntentParamsResult.error,
        ),
      );
    }

    const createPaymentIntentResult = await adyenPaymentIntentsApi.createPaymentIntent(
      adyenPaymentIntentParamsResult.value,
    );

    if (createPaymentIntentResult.isErr()) {
      const mappedError = mapAdyenErrorToApiError(createPaymentIntentResult.error);

      const config = {
        id: adyenConfigForThisChannel.value.id,
        name: adyenConfigForThisChannel.value.name,
      };

      after(() => args.problemReporter.reportApiProblem(mappedError, config));

      this.logger.warn("Failed to create payment intent", { error: mappedError });

      return ok(
        new TransactionInitializeSessionUseCaseResponses.Failure({
          transactionResult: this.resolveErrorTransactionResult(resolvedTransactionFlow),
          error: mappedError,
          appContext: appContextContainer.getContextValue(),
        }),
      );
    }

    const adyenPaymentIntent = createPaymentIntentResult.value;

    loggerContext.set(ObservabilityAttributes.PSP_REFERENCE, adyenPaymentIntent.id);

    this.logger.debug("Adyen created payment intent", { adyenResponse: adyenPaymentIntent });

    const mappedResponseResult = this.mapAdyenPaymentIntentToWebhookResponse(adyenPaymentIntent);

    if (mappedResponseResult.isErr()) {
      captureException(mappedResponseResult.error);
      this.logger.error("Failed to map Adyen Payment Intent to webhook response", {
        error: mappedResponseResult.error,
      });

      const paymentIntentIdResult = fromThrowable(createAdyenPaymentIntentId)(
        adyenPaymentIntent.id,
      );

      if (paymentIntentIdResult.isOk()) {
        const cancelResult = await adyenPaymentIntentsApi.cancelPaymentIntent({
          id: paymentIntentIdResult.value,
          // Best-effort rollback, not a Saleor-requested action - it has no idempotency key of its own
          idempotencyKey: undefined,
        });

        if (cancelResult.isErr()) {
          this.logger.warn("Failed to cancel orphaned Payment Intent after mapping failure", {
            adyenPaymentIntentId: adyenPaymentIntent.id,
            error: cancelResult.error,
          });
        }
      } else {
        this.logger.warn(
          "Cannot cancel orphaned Payment Intent - failed to parse payment intent id",
          { adyenPaymentIntentId: adyenPaymentIntent.id },
        );
      }

      return err(
        new BrokenAppResponse(appContextContainer.getContextValue(), mappedResponseResult.error),
      );
    }

    const [saleorMoney, adyenPaymentIntentId, adyenClientSecret, adyenStatus] =
      mappedResponseResult.value;

    const recordedTransaction = new RecordedTransaction({
      saleorTransactionId: createSaleorTransactionId(event.transaction.id),
      adyenPaymentIntentId,
      saleorTransactionFlow: saleorTransactionFlow,
      resolvedTransactionFlow: resolvedTransactionFlow,
      selectedPaymentMethod: selectedPaymentMethod.type,
      saleorSchemaVersion,
    });

    const recordResult = await this.transactionRecorder.recordTransaction(
      {
        saleorApiUrl: args.saleorApiUrl,
        appId: args.appId,
      },
      recordedTransaction,
    );

    if (recordResult.isErr()) {
      this.logger.error("Failed to record transaction", {
        error: recordResult.error,
      });

      const cancelResult = await adyenPaymentIntentsApi.cancelPaymentIntent({
        id: adyenPaymentIntentId,
        // Best-effort rollback, not a Saleor-requested action - it has no idempotency key of its own
        idempotencyKey: undefined,
      });

      if (cancelResult.isErr()) {
        this.logger.warn("Failed to cancel orphaned Payment Intent after DynamoDB write failure", {
          adyenPaymentIntentId,
          error: cancelResult.error,
        });
      }

      return err(new BrokenAppResponse(appContextContainer.getContextValue(), recordResult.error));
    }

    this.logger.info("Wrote Transaction to DynamoDB", {
      transaction: recordedTransaction,
    });

    const transactionResult = this.resolveOkTransactionResult({
      transactionFlow: resolvedTransactionFlow,
      adyenStatus,
    });

    return ok(
      new TransactionInitializeSessionUseCaseResponses.Success({
        saleorMoney,
        adyenPaymentIntentId,
        transactionResult,
        adyenClientSecret,
        appContext: appContextContainer.getContextValue(),
      }),
    );
  }
}
