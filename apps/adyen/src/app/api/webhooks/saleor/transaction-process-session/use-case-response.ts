// apps/adyen/src/app/api/webhooks/saleor/transaction-process-session/use-case-response.ts
import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type AppContext } from "@/lib/app-context";

class Success extends SuccessWebhookResponse {
  readonly pspReference: string;
  readonly amount: number;

  constructor(args: {
    pspReference: string;
    amount: number;
    result: "CHARGE_SUCCESS";
    appContext: AppContext;
  }) {
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

class Failure extends SuccessWebhookResponse {
  readonly pspReference: string;
  readonly amount: number;
  readonly message: string;

  constructor(args: {
    pspReference: string;
    amount: number;
    message: string;
    appContext: AppContext;
  }) {
    super(args.appContext);
    this.pspReference = args.pspReference;
    this.amount = args.amount;
    this.message = args.message;
  }

  getResponse() {
    return Response.json({
      result: "CHARGE_FAILURE",
      pspReference: this.pspReference,
      amount: this.amount,
      message: this.message,
    }, { status: this.statusCode });
  }
}

export const TransactionProcessSessionUseCaseResponses = {
  Success,
  Failure,
};