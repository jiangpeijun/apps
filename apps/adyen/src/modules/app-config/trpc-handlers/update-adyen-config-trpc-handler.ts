import { captureException } from "@sentry/nextjs";
import { TRPCError } from "@trpc/server";
import { after } from "next/server";

import { BaseError } from "@/lib/errors";
import { createInstrumentedGraphqlClient } from "@/lib/graphql-client";
import { AdyenConfig } from "@/modules/app-config/domain/adyen-config";
import { type AppConfigRepo } from "@/modules/app-config/repositories/app-config-repo";
import { adyenKeyEnv } from "@/modules/app-config/trpc-handlers/adyen-key-input-schemas";
import { updateAdyenConfigInputSchema } from "@/modules/app-config/trpc-handlers/update-adyen-config-input-schema";
import { AdyenProblemReporter } from "@/modules/app-problems/adyen-problem-reporter";
import { createSaleorApiUrl, type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";
import { AdyenAuthValidator } from "@/modules/adyen/adyen-auth-validator";
import { AdyenClient } from "@/modules/adyen/adyen-client";
import { type AdyenRestrictedKey } from "@/modules/adyen/adyen-restricted-key";
import { type AdyenWebhookManager } from "@/modules/adyen/adyen-webhook-manager";
import { createAdyenWebhookSecret } from "@/modules/adyen/adyen-webhook-secret";
import { protectedClientProcedure } from "@/modules/trpc/protected-client-procedure";

export class UpdateAdyenConfigTrpcHandler {
  baseProcedure = protectedClientProcedure;

  private readonly webhookManager: AdyenWebhookManager;

  constructor(deps: { webhookManager: AdyenWebhookManager }) {
    this.webhookManager = deps.webhookManager;
  }

  private validateRk(rk: AdyenRestrictedKey) {
    const validator = AdyenAuthValidator.createFromClient(
      AdyenClient.createFromRestrictedKey(rk),
    );

    return validator.validateAdyenAuth();
  }

  private async getRootConfigOrThrow({
    configRepo,
    appId,
    saleorApiUrl,
  }: {
    configRepo: AppConfigRepo;
    saleorApiUrl: SaleorApiUrl;
    appId: string;
  }) {
    const rootConfig = await configRepo.getRootConfig({ saleorApiUrl, appId });

    if (rootConfig.isErr()) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update Adyen configuration. Please try again.",
      });
    }

    return rootConfig.value;
  }

  getTrpcProcedure() {
    return this.baseProcedure
      .input(updateAdyenConfigInputSchema)
      .mutation(async ({ input, ctx }) => {
        const saleorApiUrl = createSaleorApiUrl(ctx.saleorApiUrl);

        /**
         * TODO: Extract such logic to be shared between handlers
         */
        if (saleorApiUrl.isErr()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Malformed request",
          });
        }

        if (!ctx.appUrl) {
          captureException(new BaseError("Missing appUrl in TRPC request"));

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Something went wrong, please contact support.",
          });
        }

        const rootConfig = await this.getRootConfigOrThrow({
          configRepo: ctx.configRepo,
          appId: ctx.appId,
          saleorApiUrl: saleorApiUrl.value,
        });

        const existingConfig = rootConfig.adyenConfigsById[input.configId];

        if (!existingConfig) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Config not found, please refresh the page and try again.",
          });
        }

        /** Empty restricted key input means "keep the one already stored". */
        const restrictedKey = input.restrictedKey ?? existingConfig.restrictedKey;

        if (adyenKeyEnv(input.publishableKey) !== adyenKeyEnv(restrictedKey)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Publishable key belongs to a different environment than the saved restricted key. To switch between sandbox and live, provide both keys.",
          });
        }

        const keysChanged =
          restrictedKey !== existingConfig.restrictedKey ||
          input.publishableKey !== existingConfig.publishableKey;

        let webhookId = existingConfig.webhookId;
        let webhookSecret = existingConfig.webhookSecret;

        if (keysChanged) {
          const rkValidationResult = await this.validateRk(restrictedKey);

          if (rkValidationResult.isErr()) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Failed to update Adyen configuration. Restricted key is invalid",
            });
          }

          const webhookReachable = await this.webhookManager.isWebhookReachableWithKey({
            webhookId: existingConfig.webhookId,
            restrictedKey,
          });

          if (webhookReachable.isErr()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Couldn't verify the existing Adyen webhook with the new key. Ensure the key can read and write webhook endpoints, then try again.",
            });
          }

          /**
           * The stored webhook lives on the Adyen account the previous key pointed to. If the new
           * key cannot see it, the configuration needs its own webhook on the new account.
           */
          if (!webhookReachable.value) {
            const webhookCreationResult = await this.webhookManager.createWebhook(
              {
                name: input.name,
                restrictedKey,
                publishableKey: input.publishableKey,
                configurationId: input.configId,
              },
              {
                saleorApiUrl: saleorApiUrl.value,
                appUrl: ctx.appUrl,
                appId: ctx.appId,
              },
            );

            if (webhookCreationResult.isErr()) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "Failed to create Adyen webhook. Please validate your credentials or contact support.",
              });
            }

            const newWebhookSecret = createAdyenWebhookSecret(webhookCreationResult.value.secret);

            if (newWebhookSecret.isErr()) {
              captureException(
                new BaseError("Secret from Adyen doesnt match expected format", {
                  cause: newWebhookSecret.error,
                }),
              );

              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                  "Failed to create Adyen webhook. Secret is invalid. Please contact support.",
              });
            }

            webhookId = webhookCreationResult.value.id;
            webhookSecret = newWebhookSecret.value;

            /**
             * Leftover endpoint on the previous account. Removal can fail (revoked key, webhook
             * already gone) and that must not fail the update - same trade-off as removing a config.
             */
            await this.webhookManager.removeWebhook({
              webhookId: existingConfig.webhookId,
              restrictedKey: existingConfig.restrictedKey,
            });
          }
        }

        const configToSave = AdyenConfig.create({
          id: existingConfig.id,
          name: input.name,
          publishableKey: input.publishableKey,
          restrictedKey,
          webhookId,
          webhookSecret,
        });

        if (configToSave.isErr()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Failed to update Adyen configuration: ${configToSave.error.message}`,
          });
        }

        const saveResult = await ctx.configRepo.saveAdyenConfig({
          config: configToSave.value,
          saleorApiUrl: saleorApiUrl.value,
          appId: ctx.appId,
        });

        if (saveResult.isErr()) {
          captureException(saveResult.error);

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update Adyen configuration. Data can't be saved.",
          });
        }

        /** Keeps the endpoint recognizable in the Adyen dashboard. Cosmetic, so failures are ignored. */
        if (input.name !== existingConfig.name) {
          after(() =>
            this.webhookManager.updateWebhookDescription({
              webhookId,
              restrictedKey,
              configName: input.name,
            }),
          );
        }

        /**
         * New credentials supersede whatever auth or signature problem was reported for this
         * configuration - the Dashboard should stop showing it.
         */
        if (keysChanged) {
          const reporter = new AdyenProblemReporter(
            createInstrumentedGraphqlClient({
              saleorApiUrl: ctx.saleorApiUrl,
              token: ctx.appToken,
            }),
          );

          after(() => reporter.clearProblemsForConfig(input.configId));
        }
      });
  }
}
