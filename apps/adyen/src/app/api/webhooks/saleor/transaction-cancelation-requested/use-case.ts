// apps/adyen/src/app/api/webhooks/saleor/transaction-cancelation-requested/use-case.ts
import { err, ok, type Result } from "neverthrow";

import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
  type MalformedRequestResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type TransactionCancelationRequestedEventFragment } from "@/generated/graphql";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { withTimeout, ADYEN_TIMEOUT_MS } from "@/modules/adyen/adyen-timeout";

import {
  TransactionCancelationRequestedUseCaseResponses,
  type TransactionCancelationRequestedUseCaseResponsesType,
} from "./use-case-response";

type UseCaseExecuteResult = Result<
  TransactionCancelationRequestedUseCaseResponsesType,
  AppIsNotConfiguredResponse | BrokenAppResponse | MalformedRequestResponse
>;

export class TransactionCancelationRequestedUseCase {
  private logger = createLogger("TransactionCancelationRequestedUseCase");
  private appConfigRepo: AppConfigRepo;

  constructor(deps: { appConfigRepo: AppConfigRepo }) {
    this.appConfigRepo = deps.appConfigRepo;
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionCancelationRequestedEventFragment;
  }): Promise<UseCaseExecuteResult> {
    const { appId, saleorApiUrl, event } = args;
    const transaction = event.transaction;

    if (!transaction) {
      return err(
        new BaseError("Transaction is missing in the event") as any
      );
    }

    const channelId = transaction.checkout?.channel.id ?? transaction.order?.channel.id;

    if (!channelId) {
      return err(
        new BaseError("Channel ID is missing in the event") as any
      );
    }

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

    const config = adyenConfigForThisChannel.value;
    if (!config) {
      this.logger.warn("Config for channel not found", { channelId });
      return err(
        new AppIsNotConfiguredResponse(
          appContextContainer.getContextValue(),
          new BaseError("No config found for channel"),
        ),
      );
    }

    appContextContainer.set({
      adyenEnv: config.environment === "live" ? "LIVE" : "TEST",
    });

    const adyen = createAdyenClient({
      apiKey: config.apiKeyEncrypted,
      environment: config.environment,
    });

    const pspReference = transaction.pspReference;

    this.logger.debug("Canceling Adyen payment with pspReference", { pspReference });

    try {
      await withTimeout(
        adyen.modificationsApi.cancelAuthorisedPaymentByPspReference(pspReference, {
          merchantAccount: config.merchantAccount,
        }),
        ADYEN_TIMEOUT_MS,
        "Adyen cancelAuthorisedPayment"
      );

      return ok(
        new TransactionCancelationRequestedUseCaseResponses.Success({
          pspReference,
          appContext: appContextContainer.getContextValue(),
        }),
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Adyen cancel failed";
      this.logger.warn("Failed to cancel Adyen payment", { error: errorMessage });

      return ok(
        new TransactionCancelationRequestedUseCaseResponses.Failure({
          pspReference,
          errorMessage,
          appContext: appContextContainer.getContextValue(),
        }),
      );
    }
  }
}