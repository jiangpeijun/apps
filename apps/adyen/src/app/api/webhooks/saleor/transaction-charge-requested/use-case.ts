// apps/adyen/src/app/api/webhooks/saleor/transaction-charge-requested/use-case.ts
import { err, ok, type Result } from "neverthrow";

import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
  type MalformedRequestResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type TransactionChargeRequestedEventFragment } from "@/generated/graphql";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { withTimeout, ADYEN_TIMEOUT_MS } from "@/modules/adyen/adyen-timeout";

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

  constructor(deps: { appConfigRepo: AppConfigRepo }) {
    this.appConfigRepo = deps.appConfigRepo;
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionChargeRequestedEventFragment;
  }): Promise<UseCaseExecuteResult> {
    const { appId, saleorApiUrl, event } = args;
    const transaction = event.transaction;

    if (!transaction) {
      return err(new BaseError("Transaction is missing in the event") as any);
    }

    const channelId = transaction.checkout?.channel.id ?? transaction.order?.channel.id;
    if (!channelId) {
      return err(new BaseError("Channel ID is missing in the event") as any);
    }

    const adyenConfigForThisChannel = await this.appConfigRepo.getAdyenConfig({
      channelId,
      appId,
      saleorApiUrl,
    });

    if (adyenConfigForThisChannel.isErr()) {
      return err(
        new BrokenAppResponse(
          appContextContainer.getContextValue(),
          adyenConfigForThisChannel.error,
        ),
      );
    }

    const config = adyenConfigForThisChannel.value;
    if (!config) {
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
    
    // 注意：这里的 event.action.amount 是 Saleor 传过来的主单位金额
    const saleorAmount = event.action.amount;
    const adyenAmount = { value: Math.round(saleorAmount * 100), currency: "USD" }; // 替换为真实币种

    this.logger.debug("Capturing Adyen payment with pspReference", { pspReference });

    try {
      // 👇 使用 Adyen 的捕获 API
      await withTimeout(
        adyen.modificationsApi.captureAuthorisedPayment(pspReference, {
          merchantAccount: config.merchantAccount,
          amount: adyenAmount,
        }),
        ADYEN_TIMEOUT_MS,
        "Adyen captureAuthorisedPayment"
      );

      return ok(
        new TransactionChargeRequestedUseCaseResponses.Success({
          pspReference,
          appContext: appContextContainer.getContextValue(),
        }),
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Adyen capture failed";
      return ok(
        new TransactionChargeRequestedUseCaseResponses.Failure({
          pspReference,
          errorMessage,
          appContext: appContextContainer.getContextValue(),
        }),
      );
    }
  }
}