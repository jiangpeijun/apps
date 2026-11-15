// apps/adyen/src/app/api/webhooks/saleor/transaction-initialize-session/use-case-response.ts
import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type AppContext } from "@/lib/app-context";
import { type TransactionSessionActionRequired } from "@/generated/app-webhooks-types/transaction-initialize-session";

class Success extends SuccessWebhookResponse {
  readonly pspReference: string;
  readonly amount: number;
  readonly paymentUrl: string;

  constructor(args: { pspReference: string; amount: number; paymentUrl: string; appContext: AppContext }) {
    super(args.appContext);
    this.pspReference = args.pspReference;
    this.amount = args.amount;
    this.paymentUrl = args.paymentUrl;
  }

  getResponse() {
    const typeSafeResponse: TransactionSessionActionRequired = {
      result: "CHARGE_ACTION_REQUIRED",
      pspReference: this.pspReference,
      amount: this.amount,
      externalUrl: this.paymentUrl,
      data: {
        paymentUrl: this.paymentUrl,
      },
    };
    return Response.json(typeSafeResponse, { status: this.statusCode });
  }
}

class Failure extends SuccessWebhookResponse {
  readonly message: string;

  constructor(args: { message: string; appContext: AppContext }) {
    super(args.appContext);
    this.message = args.message;
  }

  getResponse() {
    return Response.json({
      result: "CHARGE_FAILURE",
      message: this.message,
    }, { status: this.statusCode });
  }
}

export const TransactionInitializeSessionUseCaseResponses = {
  Success,
  Failure,
};

export type TransactionInitializeSessionUseCaseResponsesType = InstanceType<typeof Success> | InstanceType<typeof Failure>;