// apps/adyen/src/app/api/webhooks/saleor/transaction-initialize-session/use-case-response.ts
import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type AppContext } from "@/lib/app-context";

export class Success extends SuccessWebhookResponse {
  readonly pspReference: string;
  readonly amount: number;

  constructor(args: { pspReference: string; amount: number; appContext: AppContext }) {
    super(args.appContext);
    this.pspReference = args.pspReference;
    this.amount = args.amount;
  }

  getResponse() {
    return Response.json({
      result: "CHARGE_SUCCESS",
      pspReference: this.pspReference,
      amount: this.amount,
    }, { status: this.statusCode });
  }
}

export class ActionRequired extends SuccessWebhookResponse {
  readonly pspReference: string | undefined;
  readonly amount: number;
  readonly adyenAction: any;

  constructor(args: { pspReference: string | undefined; amount: number; adyenAction: any; appContext: AppContext }) {
    super(args.appContext);
    this.pspReference = args.pspReference;
    this.amount = args.amount;
    this.adyenAction = args.adyenAction;
  }

  getResponse() {
    return Response.json({
      result: "CHARGE_ACTION_REQUIRED",
      pspReference: this.pspReference,
      amount: this.amount,
      data: {
        action: this.adyenAction, // 传递给前端 Drop-in
      },
    }, { status: this.statusCode });
  }
}

export class Failure extends SuccessWebhookResponse {
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
  ActionRequired,
  Failure,
};