// apps/adyen/src/app/api/webhooks/saleor/transaction-charge-requested/use-case-response.ts
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
      result: "CHARGE_SUCCESS",
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
      result: "CHARGE_FAILURE",
      pspReference: this.pspReference,
      message: this.errorMessage,
    }, { status: this.statusCode });
  }
}

export const TransactionChargeRequestedUseCaseResponses = {
  Success,
  Failure,
};

export type TransactionChargeRequestedUseCaseResponsesType = InstanceType<
  typeof TransactionChargeRequestedUseCaseResponses.Success
> | InstanceType<
  typeof TransactionChargeRequestedUseCaseResponses.Failure
>;