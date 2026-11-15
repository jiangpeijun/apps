// apps/adyen/src/app/api/webhooks/saleor/transaction-refund-requested/use-case-response.ts
import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type AppContext } from "@/lib/app-context";

class Success extends SuccessWebhookResponse {
  readonly pspReference: string;
  readonly amount: number;

  constructor(args: { pspReference: string; amount: number; appContext: AppContext }) {
    super(args.appContext);
    this.pspReference = args.pspReference;
    this.amount = args.amount;
  }

  getResponse() {
    return Response.json({
      result: "REFUND_SUCCESS",
      pspReference: this.pspReference,
      amount: this.amount,
    }, { status: this.statusCode });
  }
}

class Failure extends SuccessWebhookResponse {
  readonly pspReference: string;
  readonly amount: number;
  readonly message: string;

  constructor(args: { pspReference: string; amount: number; message: string; appContext: AppContext }) {
    super(args.appContext);
    this.pspReference = args.pspReference;
    this.amount = args.amount;
    this.message = args.message;
  }

  getResponse() {
    return Response.json({
      result: "REFUND_FAILURE",
      pspReference: this.pspReference,
      amount: this.amount,
      message: this.message,
    }, { status: this.statusCode });
  }
}

export const TransactionRefundRequestedUseCaseResponses = {
  Success,
  Failure,
};

export type TransactionRefundRequestedUseCaseResponsesType = InstanceType<
  | typeof TransactionRefundRequestedUseCaseResponses.Success
  | typeof TransactionRefundRequestedUseCaseResponses.Failure
>;