import { fromThrowable } from "neverthrow";
import type Adyen from "adyen";

import { type AdyenClient } from "@/modules/adyen/adyen-client";
import { type AdyenWebhookSecret } from "@/modules/adyen/adyen-webhook-secret";

import { type IAdyenEventVerify, AdyenEventParsingError } from "./types";

export class AdyenWebhookSignatureValidator implements IAdyenEventVerify {
  private adyenSdkClient: Pick<Adyen, "webhooks">;

  private constructor(adyenApiWrapper: Pick<Adyen, "webhooks">) {
    this.adyenSdkClient = adyenApiWrapper;
  }

  static createFromClient(client: AdyenClient) {
    return new AdyenWebhookSignatureValidator(client.nativeClient);
  }

  verifyEvent = ({
    signatureHeader,
    webhookSecret,
    rawBody,
  }: {
    rawBody: string | Buffer;
    signatureHeader: string;
    webhookSecret: AdyenWebhookSecret;
  }) => {
    return fromThrowable(
      /**
       * Bind Adyen because otherwise it lost it's internal this
       */
      this.adyenSdkClient.webhooks.constructEvent.bind(this.adyenSdkClient.webhooks),
      (err) =>
        new AdyenEventParsingError("Failed to validate Adyen Event", {
          cause: err,
        }),
    )(rawBody, signatureHeader, webhookSecret);
  };
}
