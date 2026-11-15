// apps/adyen/src/app/api/webhooks/saleor/transaction-refund-requested/use-case.ts
import { err, ok, type Result } from "neverthrow";
import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { resolveAdyenAmount } from "@/modules/adyen/adyen-money";
import { withTimeout, ADYEN_TIMEOUT_MS } from "@/modules/adyen/adyen-timeout";
import { type TransactionRefundRequestedEventFragment } from "@/generated/graphql";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
  type MalformedRequestResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";

import {
  TransactionRefundRequestedUseCaseResponses,
  type TransactionRefundRequestedUseCaseResponsesType,
} from "./use-case-response";

type UseCaseExecuteResult = Result<
  TransactionRefundRequestedUseCaseResponsesType,
  AppIsNotConfiguredResponse | BrokenAppResponse | MalformedRequestResponse
>;

export class TransactionRefundRequestedUseCase {
  private appConfigRepo: AppConfigRepo;

  constructor(deps: { appConfigRepo: AppConfigRepo }) {
    this.appConfigRepo = deps.appConfigRepo;
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionRefundRequestedEventFragment;
  }): Promise<UseCaseExecuteResult> {
    const { appId, saleorApiUrl, event } = args;
    const transaction = event.transaction;

    if (!transaction) {
      return err(new BaseError("Transaction is missing") as any);
    }

    const channelId = transaction.checkout?.channel.id ?? transaction.order?.channel.id;
    if (!channelId) {
      return err(new BaseError("Channel ID is missing") as any);
    }

    const configResult = await this.appConfigRepo.getAdyenConfig({
      channelId,
      appId,
      saleorApiUrl,
    });

    if (configResult.isErr()) {
      return err(new BrokenAppResponse(appContextContainer.getContextValue(), configResult.error));
    }

    const config = configResult.value;
    if (!config) {
      return err(new AppIsNotConfiguredResponse(appContextContainer.getContextValue(), new BaseError("No config")));
    }

    appContextContainer.set({ adyenEnv: config.environment === "live" ? "LIVE" : "TEST" });

    const adyen = createAdyenClient({
      apiKey: config.apiKeyEncrypted,
      environment: config.environment,
    });

    const pspReference = transaction.pspReference;
    const saleorAmount = event.action.amount.amount;
    
    const adyenAmount = resolveAdyenAmount({
      amount: saleorAmount,
      currency: event.action.amount.currency,
    });

    try {
      await withTimeout<any>(
        adyen.modificationsApi.refundCapturedPayment(pspReference, {
          merchantAccount: config.merchantAccount,
          amount: adyenAmount,
        }),
        ADYEN_TIMEOUT_MS,
        "Adyen refundCapturedPayment"
      );

      return ok(
        new TransactionRefundRequestedUseCaseResponses.Success({
          pspReference,
          amount: saleorAmount,
          appContext: appContextContainer.getContextValue(),
        })
      );
    } catch (error) {
      return ok(
        new TransactionRefundRequestedUseCaseResponses.Failure({
          pspReference,
          amount: saleorAmount,
          message: error instanceof Error ? error.message : "Refund failed",
          appContext: appContextContainer.getContextValue(),
        })
      );
    }
  }
}