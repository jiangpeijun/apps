import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import {
  type TransactionRefundRequestedAsync,
  type TransactionRefundRequestedSyncFailure,
} from "@/generated/app-webhooks-types/transaction-refund-requested";
import { type AppContext } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { generatePaymentIntentAdyenDashboardUrl } from "@/modules/adyen/generate-adyen-dashboard-urls";
import { type AdyenApiError } from "@/modules/adyen/adyen-api-error";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";
import { type AdyenRefundId } from "@/modules/adyen/adyen-refund-id";
import { type RefundFailureResult } from "@/modules/transaction-result/refund-result";

class Success extends SuccessWebhookResponse {
  readonly adyenRefundId: AdyenRefundId;
  readonly message: string = "";

  constructor(args: { adyenRefundId: AdyenRefundId; appContext: AppContext }) {
    super(args.appContext);
    this.adyenRefundId = args.adyenRefundId;
  }

  getResponse(): Response {
    /*
     * We are using async flow here as currently Saleor doesn't allow `REFUND_REQUEST` to be returned in `TRANSACTION_REFUND_REQUESTED` webhook response. App will report actual refund status when handling Adyen webhook.
     * https://docs.saleor.io/developer/extending/webhooks/synchronous-events/transaction#async-flow-2
     */
    const typeSafeResponse: TransactionRefundRequestedAsync = {
      pspReference: this.adyenRefundId,
    };

    return Response.json(typeSafeResponse, { status: this.statusCode });
  }
}

class Failure extends SuccessWebhookResponse {
  readonly transactionResult: RefundFailureResult;
  readonly error: AdyenApiError;
  readonly adyenPaymentIntentId: AdyenPaymentIntentId;
  readonly message: string;

  constructor(args: {
    transactionResult: RefundFailureResult;
    error: AdyenApiError;
    adyenPaymentIntentId: AdyenPaymentIntentId;
    appContext: AppContext;
  }) {
    super(args.appContext);
    this.transactionResult = args.transactionResult;
    this.error = args.error;
    this.adyenPaymentIntentId = args.adyenPaymentIntentId;
    this.message = this.error.merchantMessage;
  }

  getResponse(): Response {
    if (!this.appContext.adyenEnv) {
      throw new BaseError("Adyen environment is not set. Ensure AppContext is set earlier");
    }

    const typeSafeResponse: TransactionRefundRequestedSyncFailure = {
      result: this.transactionResult.result,
      pspReference: this.adyenPaymentIntentId,
      message: this.messageFormatter.formatMessage(this.message, this.error),
      actions: this.transactionResult.actions,
      externalUrl: generatePaymentIntentAdyenDashboardUrl(
        this.adyenPaymentIntentId,
        this.appContext.adyenEnv,
      ),
    };

    return Response.json(typeSafeResponse, { status: this.statusCode });
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
