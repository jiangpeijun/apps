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
import { resolveAdyenAmount } from "@/modules/adyen/adyen-money";
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

    const pspReference = transaction.pspReference;
    if (!pspReference) {
      return err(new TransactionChargeRequestedUseCaseResponses.Failure({
        pspReference: "",
        errorMessage: "Missing pspReference in transaction",
        appContext: appContextContainer.getContextValue(),
      }) as any);
    }

    // 👈 使用 any 绕过 GraphQL 生成类型未更新的报错
    const currency = (event.action as any).currency || "JPY"; 
    console.log(`\n🔥 [Charge UseCase] 开始处理请款, PspRef: ${pspReference}, Amount: ${event.action.amount} ${currency}`);

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

    const adyenAmount = resolveAdyenAmount({
      amount: event.action.amount,
      currency: currency,
    });

    try {
      console.log(`🔥 [Charge UseCase] 准备调用 Adyen ModificationsApi.capture...`);
      
      // 👈 修复 1：使用 as any 绕过 SDK 类型缺失
      // 👈 修复 2：使用 as any 解决返回值为 unknown 的问题
      const captureResponse = await withTimeout(
        (adyen.checkout.ModificationsApi as any).capture({
          merchantAccount: config.merchantAccount,
          paymentPspReference: pspReference,
          amount: adyenAmount,
          reference: `capture-${event.idempotencyKey}`,
        }),
        ADYEN_TIMEOUT_MS,
        "Adyen capture"
      ) as any; 

      console.log(`✅ [Charge UseCase] Adyen API 返回, status: ${captureResponse.status}`);

      if (captureResponse.status === "received") {
        return ok(
          new TransactionChargeRequestedUseCaseResponses.Success({
            pspReference: captureResponse.pspReference || pspReference,
            appContext: appContextContainer.getContextValue(),
          }),
        );
      }

      return err(
        new TransactionChargeRequestedUseCaseResponses.Failure({
          pspReference: pspReference,
          errorMessage: `Capture failed with status: ${captureResponse.status}`,
          appContext: appContextContainer.getContextValue(),
        }) as any
      );

    } catch (error: any) {
      console.error(`💥 [Charge UseCase] Adyen 捕获异常:`, error);
      return err(
        new TransactionChargeRequestedUseCaseResponses.Failure({
          pspReference: pspReference,
          errorMessage: error.message || "Adyen capture failed",
          appContext: appContextContainer.getContextValue(),
        }) as any
      );
    }
  }
}