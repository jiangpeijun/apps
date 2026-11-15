// apps/adyen/src/app/api/webhooks/saleor/transaction-process-session/use-case-response.ts
import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type AppContext } from "@/lib/app-context";

class Success extends SuccessWebhookResponse {
  readonly pspReference: string;
  readonly amount: number;
  readonly result: "CHARGE_SUCCESS" | "CHARGE_ACTION_REQUIRED";
  readonly paymentUrl?: string;

  constructor(args: {
    pspReference: string;
    amount: number;
    result: "CHARGE_SUCCESS" | "CHARGE_ACTION_REQUIRED";
    paymentUrl?: string;
    appContext: AppContext;
  }) {
    super(args.appContext);
    this.pspReference = args.pspReference;
    this.amount = args.amount;
    this.result = args.result;
    this.paymentUrl = args.paymentUrl;
  }

  getResponse() {
    return Response.json({
      result: this.result,
      pspReference: this.pspReference,
      amount: this.amount,
      externalUrl: this.paymentUrl,
      data: this.paymentUrl ? { paymentUrl: this.paymentUrl } : undefined,
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

export type TransactionProcessSessionUseCaseResponsesType = InstanceType<
  | typeof TransactionProcessSessionUseCaseResponses.Success
  | typeof TransactionProcessSessionUseCaseResponses.Failure
>;