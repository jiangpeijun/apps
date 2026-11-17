// apps/adyen/src/app/api/webhooks/saleor/payment-gateway-initialize-session/use-case-response.ts
import { z } from "zod";
import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type PaymentGatewayInitializeSession } from "@/generated/app-webhooks-types/payment-gateway-initialize-session";
import { type AppContext } from "@/lib/app-context";

class Success extends SuccessWebhookResponse {
  private clientKey: string;
  private environment: string;
  private paymentMethodsResponse: any;

  private static ResponseDataSchema = z.object({
    clientKey: z.string(),
    environment: z.string(),
    paymentMethodsResponse: z.any(),
  });

  constructor(args: { 
    clientKey: string; 
    environment: string; 
    paymentMethodsResponse: any; 
    appContext: AppContext 
  }) {
    super(args.appContext);
    this.clientKey = args.clientKey;
    this.environment = args.environment;
    this.paymentMethodsResponse = args.paymentMethodsResponse;
  }

  getResponse() {
    const typeSafeResponse: PaymentGatewayInitializeSession = {
      data: Success.ResponseDataSchema.parse({
        clientKey: this.clientKey,
        environment: this.environment,
        paymentMethodsResponse: this.paymentMethodsResponse,
      }),
    };

    return Response.json(typeSafeResponse, { status: this.statusCode });
  }
}

export const PaymentGatewayInitializeSessionUseCaseResponses = { Success };
export type PaymentGatewayInitializeSessionUseCaseResponsesType = InstanceType<typeof Success>;