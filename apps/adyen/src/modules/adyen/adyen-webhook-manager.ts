// apps/adyen/src/modules/adyen/adyen-webhook-manager.ts
import { ok, type Result } from "neverthrow";
import { BaseError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";

export const AdyenWebhookManagerErrors = {
  CantCreateWebhookError: BaseError.subclass("CantCreateWebhookError"),
  CantRemoveWebhookError: BaseError.subclass("CantRemoveWebhookError"),
  CantFetchWebhookError: BaseError.subclass("CantFetchWebhookError"),
  CantUpdateWebhookError: BaseError.subclass("CantUpdateWebhookError"),
  CantCreateWebhookUrlError: BaseError.subclass("CantCreateWebhookUrlError"),
};

export class AdyenWebhookManager {
  private logger = createLogger("AdyenWebhookManager");

  async getWebhook(_args: any) {
    return ok({ status: "enabled" as const });
  }

  async isWebhookReachableWithKey(_args: any): Promise<Result<boolean, any>> {
    return ok(true);
  }

  async updateWebhookDescription(_args: any) {
    return ok(null);
  }

  async removeWebhook(_args: any) {
    return ok(null);
  }

  async createWebhook(_config: any, _context: any): Promise<Result<{ secret: string; id: string }, any>> {
    this.logger.info("Mocking Webhook creation (Manual configuration in Adyen Dashboard is recommended)");
    return ok({
      secret: "manual_hmac_key",
      id: "manual_webhook_id",
    });
  }
}