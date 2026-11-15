// apps/adyen/src/app/api/webhooks/saleor/transaction-cancelation-requested/use-case-response.ts
import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import { type AppContext } from "@/lib/app-context";

class Success extends SuccessWebhookResponse {
  readonly pspReference: string;

  constructor(args: { pspReference: string; appContext: AppContext }) {
    super(args.appContext);
    this.pspReference = args.pspReference;
  }

  getResponse() {
    return Response.json({
      result: "CANCEL_SUCCESS",
      pspReference: this.pspReference,
    }, { status: this.statusCode });
  }
}

class Failure extends SuccessWebhookResponse {
  readonly pspReference: string;
  readonly errorMessage: string;

  constructor(args: { pspReference: string; errorMessage: string; appContext: AppContext }) {
    super(args.appContext);
    this.pspReference = args.pspReference;
    this.errorMessage = args.errorMessage;
  }

  getResponse() {
    return Response.json({
      result: "CANCEL_FAILURE",
      pspReference: this.pspReference,
      message: this.errorMessage,
    }, { status: this.statusCode });
  }
}

export const TransactionCancelationRequestedUseCaseResponses = {
  Success,
  Failure,
};

export type TransactionCancelationRequestedUseCaseResponsesType = InstanceType<
  typeof TransactionCancelationRequestedUseCaseResponses.Success
> | InstanceType<
  typeof TransactionCancelationRequestedUseCaseResponses.Failure
>;