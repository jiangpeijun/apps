import { err, ok, type Result } from "neverthrow";

import {
  AppIsNotConfiguredResponse,
  BrokenAppResponse,
} from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { appContextContainer } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";

import {
  PaymentGatewayInitializeSessionUseCaseResponses,
  type PaymentGatewayInitializeSessionUseCaseResponsesType,
} from "./use-case-response";

export class PaymentGatewayInitializeSessionUseCase {
  private appConfigRepo: AppConfigRepo;
  private logger = createLogger("PaymentGatewayInitializeSessionUseCase");

  static UseCaseError = BaseError.subclass("PaymentGatewayInitializeSessionUseCaseError", {
    props: {
      _internalName: "InitializeAdyenSessionUseCaseError" as const,
    },
  });

  constructor(deps: { appConfigRepo: AppConfigRepo }) {
    this.appConfigRepo = deps.appConfigRepo;
  }

  async execute(params: {
    channelId: string;
    appId: string;
    saleorApiUrl: SaleorApiUrl;
  }): Promise<
    Result<
      PaymentGatewayInitializeSessionUseCaseResponsesType,
      AppIsNotConfiguredResponse | BrokenAppResponse
    >
  > {
    const { channelId, appId, saleorApiUrl } = params;

    const adyenConfigForThisChannel = await this.appConfigRepo.getAdyenConfig({
      channelId,
      appId,
      saleorApiUrl,
    });

    if (adyenConfigForThisChannel.isOk()) {
      const pk = adyenConfigForThisChannel.value?.publishableKey;

      if (!pk) {
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

      return ok(
        new PaymentGatewayInitializeSessionUseCaseResponses.Success({
          pk,
          appContext: appContextContainer.getContextValue(),
        }),
      );
    }

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

    throw new PaymentGatewayInitializeSessionUseCase.UseCaseError("Leaky logic, should not happen");
  }
}
