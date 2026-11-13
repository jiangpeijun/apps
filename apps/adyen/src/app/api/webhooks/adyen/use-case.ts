import { type APL, type AuthData } from "@saleor/app-sdk/APL";
import { ObservabilityAttributes } from "@saleor/apps-otel/src/observability-attributes";
import { captureException } from "@sentry/nextjs";
import { err, ok, type Result } from "neverthrow";
import { after } from "next/server";
import type Adyen from "adyen";

import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { loggerContext } from "@/lib/logger-context";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type AdyenProblemReporter } from "@/modules/app-problems";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import {
  type ITransactionEventReporter,
  TransactionEventReporterErrors,
} from "@/modules/saleor/transaction-event-reporter";
import { AdyenClient } from "@/modules/adyen/adyen-client";
import { type AdyenEnv } from "@/modules/adyen/adyen-env";
import { type AdyenRestrictedKey } from "@/modules/adyen/adyen-restricted-key";
import { type AdyenWebhookManager } from "@/modules/adyen/adyen-webhook-manager";
import {
  type AllowedAdyenObjectMetadata,
  type IAdyenEventVerify,
  type IAdyenPaymentIntentsApiFactory,
} from "@/modules/adyen/types";
import {
  TransactionRecorderError,
  type TransactionRecorderRepo,
} from "@/modules/transactions-recording/repositories/transaction-recorder-repo";

import { AdyenPaymentIntentHandler } from "./adyen-object-handlers/adyen-payment-intent-handler";
import { AdyenRefundHandler } from "./adyen-object-handlers/adyen-refund-handler";
import {
  type PossibleAdyenWebhookErrorResponses,
  type PossibleAdyenWebhookSuccessResponses,
  AdyenWebhookAppIsNotConfiguredResponse,
  AdyenWebhookMalformedRequestResponse,
  AdyenWebhookSeverErrorResponse,
  AdyenWebhookSuccessResponse,
  AdyenWebhookTransactionMissingResponse,
} from "./adyen-webhook-responses";
import { type WebhookParams } from "./webhook-params";

type R = Promise<
  Result<PossibleAdyenWebhookSuccessResponses, PossibleAdyenWebhookErrorResponses>
>;

type AdyenVerifyEventFactory = (adyenClient: AdyenClient) => IAdyenEventVerify;
type SaleorTransactionEventReporterFactory = (authData: AuthData) => ITransactionEventReporter;
type ProblemReporterFactory = (authData: AuthData) => AdyenProblemReporter;

const ObjectMetadataMissingError = BaseError.subclass("ObjectMetadataMissingError");
const ObjectMetadataMismatchError = BaseError.subclass("ObjectMetadataMismatchError");

/**
 * Missing saleor_app_id is allowed for objects created before it was introduced.
 */
const isFromDifferentInstallation = (meta: AllowedAdyenObjectMetadata, appId: string) =>
  Boolean(meta.saleor_app_id) && meta.saleor_app_id !== appId;

export class AdyenWebhookUseCase {
  private appConfigRepo: AppConfigRepo;
  private webhookEventVerifyFactory: AdyenVerifyEventFactory;
  private apl: APL;
  private logger = createLogger("AdyenWebhookUseCase");
  private transactionRecorder: TransactionRecorderRepo;
  private transactionEventReporterFactory: SaleorTransactionEventReporterFactory;
  private problemReporterFactory: ProblemReporterFactory;
  private webhookManager: AdyenWebhookManager;
  private adyenPaymentIntentsApiFactory: IAdyenPaymentIntentsApiFactory;

  constructor(deps: {
    appConfigRepo: AppConfigRepo;
    webhookEventVerifyFactory: AdyenVerifyEventFactory;
    apl: APL;
    transactionRecorder: TransactionRecorderRepo;
    transactionEventReporterFactory: SaleorTransactionEventReporterFactory;
    problemReporterFactory: ProblemReporterFactory;
    webhookManager: AdyenWebhookManager;
    adyenPaymentIntentsApiFactory: IAdyenPaymentIntentsApiFactory;
  }) {
    this.appConfigRepo = deps.appConfigRepo;
    this.webhookEventVerifyFactory = deps.webhookEventVerifyFactory;
    this.apl = deps.apl;
    this.transactionRecorder = deps.transactionRecorder;
    this.transactionEventReporterFactory = deps.transactionEventReporterFactory;
    this.problemReporterFactory = deps.problemReporterFactory;
    this.webhookManager = deps.webhookManager;
    this.adyenPaymentIntentsApiFactory = deps.adyenPaymentIntentsApiFactory;
  }

  private async removeAdyenWebhook({
    webhookId,
    restrictedKey,
  }: {
    webhookId: string;
    restrictedKey: AdyenRestrictedKey;
  }) {
    const result = await this.webhookManager.removeWebhook({ webhookId, restrictedKey });

    if (result.isErr()) {
      this.logger.warn(`Failed to remove webhook ${webhookId}`, result.error);

      return err(new BaseError("Failed to remove webhook", { cause: result.error }));
    }

    this.logger.info(`Webhook ${webhookId} removed successfully`);

    return ok(null);
  }

  private async processEvent({
    event,
    saleorApiUrl,
    appId,
    adyenEnv,
    restrictedKey,
  }: {
    event: Adyen.Event;
    saleorApiUrl: SaleorApiUrl;
    appId: string;
    adyenEnv: AdyenEnv;
    restrictedKey: AdyenRestrictedKey;
  }) {
    switch (event.data.object.object) {
      case "payment_intent": {
        loggerContext.set(ObservabilityAttributes.PSP_REFERENCE, event.data.object.id);

        const meta = event.data.object.metadata as AllowedAdyenObjectMetadata;

        if (!meta?.saleor_transaction_id) {
          return err(
            new ObjectMetadataMissingError(
              "Missing metadata on object, it was not created by Saleor",
              {
                props: { meta },
              },
            ),
          );
        }

        if (isFromDifferentInstallation(meta, appId)) {
          return err(
            new ObjectMetadataMismatchError(
              "PaymentIntent belongs to a different Saleor installation",
              {
                props: { meta, expectedAppId: appId },
              },
            ),
          );
        }

        const handler = new AdyenPaymentIntentHandler();

        const adyenPaymentIntentsApi = this.adyenPaymentIntentsApiFactory.create({
          key: restrictedKey,
        });

        return handler.processPaymentIntentEvent({
          event,
          adyenEnv,
          transactionRecorder: this.transactionRecorder,
          appId,
          saleorApiUrl,
          adyenPaymentIntentsApi,
        });
      }

      case "refund": {
        loggerContext.set("adyenRefundId", event.data.object.id);

        const meta = event.data.object.metadata as AllowedAdyenObjectMetadata;

        if (!meta?.saleor_transaction_id) {
          return err(
            new ObjectMetadataMissingError(
              "Missing metadata on object, it was not created by Saleor",
              {
                props: { meta },
              },
            ),
          );
        }

        if (isFromDifferentInstallation(meta, appId)) {
          return err(
            new ObjectMetadataMismatchError("Refund belongs to a different Saleor installation", {
              props: { meta, expectedAppId: appId },
            }),
          );
        }

        const handler = new AdyenRefundHandler();

        return handler.processRefundEvent({
          event,
          adyenEnv,
          transactionRecorder: this.transactionRecorder,
          appId,
          saleorApiUrl,
        });
      }

      default: {
        throw new BaseError(`Support for object ${event.data.object.object} not implemented`);
      }
    }
  }

  /**
   * It handles case when
   * 1. App was installed and configured. Webhook exists in Adyen
   * 2. App is removed - webhook is not
   * 3. App is reinstalled and configured again
   * 4. There are now 2 webhooks - old and new. Old one will always fail.
   *
   * At this point we detect an old webhook because it has different appId in URL (from previous installation).
   * Now we can use that to fetch old config from DB and remove the webhook.
   */
  private async processLegacyWebhook(webhookParams: WebhookParams, authData: AuthData) {
    const legacyConfig = await this.appConfigRepo.getAdyenConfig({
      configId: webhookParams.configurationId,
      // Use app ID from webhook, not AuthData, so we have it frozen in time
      appId: webhookParams.appId,
      saleorApiUrl: webhookParams.saleorApiUrl,
    });

    if (legacyConfig.isErr()) {
      captureException(
        new BaseError(
          "Failed to fetch config attached to legacy Webhook, this requires manual cleanup",
          {
            cause: legacyConfig.error,
          },
        ),
      );

      return err(
        new BaseError("Failed to fetch legacy config", {
          cause: legacyConfig.error,
        }),
      );
    }

    if (!legacyConfig.value) {
      /*
       * Not an app error - old config is already gone, so we can't remove the orphaned webhook.
       * Surfaced to the user via AppProblems so they delete it in Adyen Dashboard.
       */
      this.logger.warn("Legacy config is empty, this requires manual cleanup");

      const problemReporter = this.problemReporterFactory(authData);

      after(() => problemReporter.reportLegacyWebhookOrphaned(webhookParams.configurationId));

      return err(new BaseError("Legacy config is empty"));
    }

    const removalResult = await this.removeAdyenWebhook({
      webhookId: legacyConfig.value.webhookId,
      restrictedKey: legacyConfig.value.restrictedKey,
    });

    if (removalResult.isErr()) {
      return err(new BaseError("Failed to remove legacy webhook", { cause: removalResult.error }));
    }

    return ok(null);
  }

  async execute({
    rawBody,
    signatureHeader,
    webhookParams,
  }: {
    /**
     * Raw request body for signature verification
     */
    rawBody: string;
    /**
     * Header that Adyen sends with webhook
     */
    signatureHeader: string;
    /**
     * Parsed params that come from Adyen Webhook
     */
    webhookParams: WebhookParams;
  }): R {
    this.logger.debug("Executing");
    const authData = await this.apl.get(webhookParams.saleorApiUrl);

    if (!authData) {
      captureException(
        new BaseError("AuthData from APL is empty, installation may be broken"),
        (s) => s.setLevel("warning"),
      );

      return err(new AdyenWebhookAppIsNotConfiguredResponse());
    }

    if (authData.appId !== webhookParams.appId) {
      this.logger.warn(
        "Received webhook with different appId than expected. There may be old webhook from uninstalled app. Will try to remove it now.",
      );

      const processingResult = await this.processLegacyWebhook(webhookParams, authData);

      if (processingResult.isErr()) {
        this.logger.warn("Received legacy webhook but failed to handle removing it", {
          error: processingResult.error,
        });

        return err(new AdyenWebhookAppIsNotConfiguredResponse());
      } else {
        return ok(new AdyenWebhookSuccessResponse());
      }
    }

    const transactionEventReporter = this.transactionEventReporterFactory(authData);
    const problemReporter = this.problemReporterFactory(authData);

    const config = await this.appConfigRepo.getAdyenConfig({
      configId: webhookParams.configurationId,
      appId: authData.appId,
      saleorApiUrl: webhookParams.saleorApiUrl,
    });

    this.logger.debug("Configuration for config resolved");

    if (config.isErr()) {
      this.logger.error("Failed to fetch config from database", {
        error: config.error,
      });

      captureException(config.error);

      return err(new AdyenWebhookAppIsNotConfiguredResponse());
    }

    if (!config.value) {
      /*
       * Not an app error - Adyen may keep sending events for a deleted config (orphaned webhook).
       * Surfaced to the user via AppProblems below instead of alerting us.
       */
      this.logger.warn("Config for given webhook is missing");

      after(() => problemReporter.reportConfigMissing(webhookParams.configurationId));

      return err(new AdyenWebhookAppIsNotConfiguredResponse());
    }

    appContextContainer.set({
      adyenEnv: config.value.getAdyenEnvValue(),
    });

    const adyenClient = AdyenClient.createFromRestrictedKey(config.value.restrictedKey);
    const eventVerifier = this.webhookEventVerifyFactory(adyenClient);

    const event = eventVerifier.verifyEvent({
      rawBody,
      webhookSecret: config.value.webhookSecret,
      signatureHeader,
    });

    this.logger.debug("Event verified");

    if (event.isErr()) {
      this.logger.error("Failed to verify event", {
        error: event.error,
      });

      const configName = config.value.name;

      after(() =>
        problemReporter.reportWebhookSecretMismatch(webhookParams.configurationId, configName),
      );

      return err(new AdyenWebhookMalformedRequestResponse());
    }

    this.logger.debug(`Resolved event type: ${event.value.type}`);

    const processingResult = await this.processEvent({
      event: event.value,
      saleorApiUrl: webhookParams.saleorApiUrl,
      appId: authData.appId,
      adyenEnv: config.value.getAdyenEnvValue(),
      restrictedKey: config.value.restrictedKey,
    });

    if (processingResult.isErr()) {
      /**
       * Events below are not for this installation - acknowledge with 200,
       * otherwise Adyen keeps retrying (it retries 4xx too) and reports failed webhook deliveries.
       *
       * Objects created outside of Saleor (e.g. Payment Links) are a valid setup - just ignore them.
       */
      if (processingResult.error instanceof ObjectMetadataMissingError) {
        this.logger.info("Ignoring event for object created outside of Saleor");

        return ok(new AdyenWebhookSuccessResponse());
      }

      // E.g. other Saleor environment connected to the same Adyen account in the same mode
      if (processingResult.error instanceof ObjectMetadataMismatchError) {
        this.logger.info("Ignoring event for object created by a different Saleor installation");

        const configName = config.value.name;

        after(() =>
          problemReporter.reportObjectFromDifferentInstallation(
            webhookParams.configurationId,
            configName,
          ),
        );

        return ok(new AdyenWebhookSuccessResponse());
      }

      this.logger.error("Failed to process event", {
        error: processingResult.error,
      });

      if (processingResult.error instanceof TransactionRecorderError.TransactionMissingError) {
        return err(new AdyenWebhookTransactionMissingResponse());
      }

      return err(new AdyenWebhookSeverErrorResponse());
    }

    loggerContext.set(
      ObservabilityAttributes.TRANSACTION_ID,
      processingResult.value.saleorTransactionId,
    );
    loggerContext.set("amount", processingResult.value.saleorMoney.amount);
    loggerContext.set("result", processingResult.value.transactionResult.result);

    const reportResult = await transactionEventReporter.reportTransactionEvent(
      processingResult.value.resolveEventReportVariables(),
    );

    if (reportResult.isErr()) {
      if (reportResult.error instanceof TransactionEventReporterErrors.AlreadyReportedError) {
        this.logger.info("Transaction event already reported");

        return ok(new AdyenWebhookSuccessResponse());
      }

      this.logger.error("Failed to report transaction event", {
        error: reportResult.error,
      });

      return err(new AdyenWebhookSeverErrorResponse());
    }

    this.logger.info("Transaction event reported");

    return ok(new AdyenWebhookSuccessResponse());
  }
}
