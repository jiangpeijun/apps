// apps/adyen/src/app/api/webhooks/saleor/transaction-initialize-session/use-case.ts
import { err, ok } from "neverthrow";
import { createAdyenClient } from "@/modules/adyen/adyen-client";
import { resolveAdyenAmount } from "@/modules/adyen/adyen-money";
import { withTimeout, ADYEN_TIMEOUT_MS } from "@/modules/adyen/adyen-timeout";
import { type TransactionInitializeSessionEventFragment } from "@/generated/graphql";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { saveTransactionMapping } from "@/modules/adyen/transaction-recorder";
import { TransactionInitializeSessionUseCaseResponses } from "./use-case-response";

export class TransactionInitializeSessionUseCase {
  private appConfigRepo: AppConfigRepo;

  constructor(deps: { appConfigRepo: AppConfigRepo }) {
    this.appConfigRepo = deps.appConfigRepo;
  }

  async execute(args: {
    appId: string;
    saleorApiUrl: SaleorApiUrl;
    event: TransactionInitializeSessionEventFragment;
    token: string; 
  }) {
    const { appId, saleorApiUrl, event, token } = args;
    
    // 获取渠道 ID
    const channelId = event.sourceObject.channel.id;

    const configResult = await this.appConfigRepo.getAdyenConfig({
      channelId,
      appId,
      saleorApiUrl,
    });

    if (configResult.isErr() || !configResult.value) {
      return err(new BaseError("No config found for channel") as any);
    }

    const config = configResult.value;
    appContextContainer.set({
      adyenEnv: config.environment === "live" ? "LIVE" : "TEST",
    });

    const adyen = createAdyenClient({
      apiKey: config.apiKeyEncrypted,
      environment: config.environment,
    });

    const saleorAmount = event.action.amount;
    const adyenAmount = resolveAdyenAmount({
      amount: saleorAmount,
      currency: event.action.currency,
    });

    try {
      const link = await withTimeout(
        adyen.paymentLinksApi.paymentLinks({
          amount: adyenAmount,
          reference: `saleor-${event.transaction.id}`,
          merchantAccount: config.merchantAccount,
          returnUrl: `${config.storefrontUrl}/checkout/adyen-return`,
        }),
        ADYEN_TIMEOUT_MS,
        "Adyen paymentLinks"
      );

      // 存入 DynamoDB (之前提到的核心逻辑)
      await saveTransactionMapping({
        pspReference: link.id,
        transactionId: event.transaction.id,
        saleorApiUrl,
        token,
      });

      return ok(
        new TransactionInitializeSessionUseCaseResponses.Success({
          pspReference: link.id,
          amount: saleorAmount,
          paymentUrl: link.url!,
          appContext: appContextContainer.getContextValue(),
        })
      );
    } catch (error) {
      return ok(
        new TransactionInitializeSessionUseCaseResponses.Failure({
          message: error instanceof Error ? error.message : "Adyen timeout",
          appContext: appContextContainer.getContextValue(),
        })
      );
    }
  }
}