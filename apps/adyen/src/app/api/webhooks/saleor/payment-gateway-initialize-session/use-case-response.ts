import { z } from "zod";

import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type PaymentGatewayInitializeSession } from "@/generated/app-webhooks-types/payment-gateway-initialize-session";
import { type AppContext } from "@/lib/app-context";
import { type AdyenPublishableKey } from "@/modules/adyen/adyen-publishable-key";

class Success extends SuccessWebhookResponse {
  readonly pk: AdyenPublishableKey;

  private static ResponseDataSchema = z.object({
    adyenPublishableKey: z.string(),
  });

  constructor(args: { pk: AdyenPublishableKey; appContext: AppContext }) {
    super(args.appContext);
    this.pk = args.pk;
  }

  getResponse() {
    const typeSafeResponse: PaymentGatewayInitializeSession = {
      data: Success.ResponseDataSchema.parse({
        adyenPublishableKey: this.pk,
      }),
    };

    return Response.json(typeSafeResponse, { status: this.statusCode });
  }
}

export const PaymentGatewayInitializeSessionUseCaseResponses = {
  Success,
};

export type PaymentGatewayInitializeSessionUseCaseResponsesType = InstanceType<
  typeof PaymentGatewayInitializeSessionUseCaseResponses.Success
>;
