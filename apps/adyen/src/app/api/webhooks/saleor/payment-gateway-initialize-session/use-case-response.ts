// apps/adyen/src/app/api/webhooks/saleor/payment-gateway-initialize-session/use-case-response.ts
import { z } from "zod";

import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type PaymentGatewayInitializeSession } from "@/generated/app-webhooks-types/payment-gateway-initialize-session";
import { type AppContext } from "@/lib/app-context";

class Success extends SuccessWebhookResponse {
  readonly clientKey: string;
  readonly environment: string;

  // 👇 定义返回给 Storefront 的数据结构
  private static ResponseDataSchema = z.object({
    clientKey: z.string(),
    environment: z.string(),
  });

  constructor(args: { clientKey: string; environment: string; appContext: AppContext }) {
    super(args.appContext);
    this.clientKey = args.clientKey;
    this.environment = args.environment;
  }

  getResponse() {
    const typeSafeResponse: PaymentGatewayInitializeSession = {
      // 👇 返回 Adyen 前端组件需要的参数
      data: Success.ResponseDataSchema.parse({
        clientKey: this.clientKey,
        environment: this.environment, // 例如 "test" 或 "live"
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