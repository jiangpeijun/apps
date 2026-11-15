// apps/adyen/src/app/api/webhooks/saleor/transaction-process-session/use-case.ts
import { err, ok, type Result } from "neverthrow";
import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { withTimeout, ADYEN_TIMEOUT_MS } from "@/modules/adyen/adyen-timeout";
import { type TransactionProcessSessionEventFragment } from "@/generated/graphql";
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
  TransactionProcessSessionUseCaseResponses,
  type TransactionProcessSessionUseCaseResponsesType,
} from "./use-case-response";

type UseCaseExecuteResult = Result<
  TransactionProcessSessionUseCaseResponsesType,
  AppIsNotConfiguredResponse | BrokenAppResponse | MalformedRequestResponse
>;

export class TransactionProcessSessionUseCase {
  private appConfigRepo: AppConfigRepo;

  constructor(deps: { appConfigRepo: AppConfigRepo }) {
    this.appConfigRepo = deps.appConfigRepo;
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionProcessSessionEventFragment;
  }): Promise<UseCaseExecuteResult> {
    const { appId, saleorApiUrl, event } = args;
    const pspReference = event.transaction?.pspReference;
    
    // 从 sourceObject 中获取 channelId
    const channelId = event.sourceObject?.channel?.id;

    if (!pspReference || !channelId) {
      return err(
        new BrokenAppResponse(
          appContextContainer.getContextValue(),
          new BaseError("Missing pspReference or channelId") as any
        )
      );
    }

    const configResult = await this.appConfigRepo.getAdyenConfig({
      channelId,
      appId,
      saleorApiUrl,
    });

    if (configResult.isErr()) {
      return err(
        new BrokenAppResponse(
          appContextContainer.getContextValue(),
          configResult.error
        )
      );
    }

    const config = configResult.value;
    if (!config) {
      return err(
        new AppIsNotConfiguredResponse(
          appContextContainer.getContextValue(),
          new BaseError("No config found for channel")
        )
      );
    }

    appContextContainer.set({
      adyenEnv: config.environment === "live" ? "LIVE" : "TEST",
    });

    const adyen = createAdyenClient({
      apiKey: config.apiKeyEncrypted,
      environment: config.environment,
    });

    try {
      const link = await withTimeout(
        adyen.paymentLinksApi.getPaymentLink(pspReference),
        ADYEN_TIMEOUT_MS,
        "Adyen getPaymentLink"
      );

      // 返回给 Saleor 的金额需要是主单位（如 10.50）
      const saleorAmount = event.action.amount;

      switch (link.status as string) {
        case "completed":
          return ok(
            new TransactionProcessSessionUseCaseResponses.Success({
              pspReference,
              amount: saleorAmount,
              result: "CHARGE_SUCCESS",
              appContext: appContextContainer.getContextValue(),
            })
          );
        case "expired":
        case "cancelled":
          return ok(
            new TransactionProcessSessionUseCaseResponses.Failure({
              pspReference,
              amount: saleorAmount,
              message: `Payment link ${link.status}`,
              appContext: appContextContainer.getContextValue(),
            })
          );
        case "active":
        default:
          return ok(
            new TransactionProcessSessionUseCaseResponses.Success({
              pspReference,
              amount: saleorAmount,
              result: "CHARGE_ACTION_REQUIRED",
              paymentUrl: link.url,
              appContext: appContextContainer.getContextValue(),
            })
          );
      }
    } catch (error) {
      return ok(
        new TransactionProcessSessionUseCaseResponses.Failure({
          pspReference,
          amount: event.action.amount,
          message: error instanceof Error ? error.message : "Adyen query failed",
          appContext: appContextContainer.getContextValue(),
        })
      );
    }
  }
}