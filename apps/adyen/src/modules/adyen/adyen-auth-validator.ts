import { err, ok, type Result } from "neverthrow";
import type Adyen from "adyen";

import { BaseError } from "@/lib/errors";
import { type AdyenClient } from "@/modules/adyen/adyen-client";

export class AdyenAuthValidator {
  adyen: Adyen;

  static AuthError = BaseError.subclass("AdyenAuthValidator.AuthError", {
    props: {
      _internalName: "AdyenAuthValidator.AuthError" as const,
    },
  });

  private constructor(adyen: Adyen) {
    this.adyen = adyen;
  }

  static createFromClient(client: AdyenClient) {
    return new AdyenAuthValidator(client.nativeClient);
  }

  /**
   * Checks if restricted keys is valid. Infers permissions scope by calling APIs that are needed by app
   */
  async validateAdyenAuth(): Promise<
    Result<null, InstanceType<typeof AdyenAuthValidator.AuthError>>
  > {
    try {
      await this.adyen.paymentIntents.list({ limit: 1 });

      return ok(null);
    } catch (e) {
      return err(
        new AdyenAuthValidator.AuthError("Failed to authorize with Adyen", { cause: e }),
      );
    }
  }
}
