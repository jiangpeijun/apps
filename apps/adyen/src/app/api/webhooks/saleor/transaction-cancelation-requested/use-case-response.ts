import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import {
  type TransactionCancelationRequestedSyncFailure,
  type TransactionCancelationRequestedSyncSuccess,
} from "@/generated/app-webhooks-types/transaction-cancelation-requested";
import { type AppContext } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { type SaleorMoney } from "@/modules/saleor/saleor-money";
import { generatePaymentIntentAdyenDashboardUrl } from "@/modules/adyen/generate-adyen-dashboard-urls";
import { type AdyenApiError } from "@/modules/adyen/adyen-api-error";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";
import {
  type CancelFailureResult,
  type CancelSuccessResult,
} from "@/modules/transaction-result/cancel-result";

class Success extends SuccessWebhookResponse {
  readonly transactionResult: CancelSuccessResult;
  readonly saleorMoney: SaleorMoney;
  readonly timestamp: Date | null;
  readonly adyenPaymentIntentId: AdyenPaymentIntentId;

  constructor(args: {
    transactionResult: CancelSuccessResult;
    saleorMoney: SaleorMoney;
    timestamp: Date | null;
    adyenPaymentIntentId: AdyenPaymentIntentId;
    appContext: AppContext;
  }) {
    super(args.appContext);
    this.transactionResult = args.transactionResult;
    this.saleorMoney = args.saleorMoney;
    this.timestamp = args.timestamp;
    this.adyenPaymentIntentId = args.adyenPaymentIntentId;
  }

  getResponse(): Response {
    if (!this.appContext.adyenEnv) {
      throw new BaseError("Adyen environment is not set. Ensure AppContext is set earlier");
    }

    const typeSafeResponse: TransactionCancelationRequestedSyncSuccess = {
      result: this.transactionResult.result,
      amount: this.saleorMoney.amount,
      pspReference: this.adyenPaymentIntentId,
      message: this.messageFormatter.formatMessage(this.transactionResult.message),
      actions: this.transactionResult.actions,
      externalUrl: generatePaymentIntentAdyenDashboardUrl(
        this.adyenPaymentIntentId,
        this.appContext.adyenEnv,
      ),
      time: this.timestamp?.toISOString(),
    };

    return Response.json(typeSafeResponse, { status: this.statusCode });
  }
}

class Failure extends SuccessWebhookResponse {
  readonly transactionResult: CancelFailureResult;
  readonly error: AdyenApiError;
  readonly adyenPaymentIntentId: AdyenPaymentIntentId;

  constructor(args: {
    transactionResult: CancelFailureResult;
    error: AdyenApiError;
    adyenPaymentIntentId: AdyenPaymentIntentId;
    appContext: AppContext;
  }) {
    super(args.appContext);
    this.transactionResult = args.transactionResult;
    this.error = args.error;
    this.adyenPaymentIntentId = args.adyenPaymentIntentId;
  }

  getResponse(): Response {
    if (!this.appContext.adyenEnv) {
      throw new BaseError("Adyen environment is not set. Ensure AppContext is set earlier");
    }

    const typeSafeResponse: TransactionCancelationRequestedSyncFailure = {
      result: this.transactionResult.result,
      pspReference: this.adyenPaymentIntentId,
      message: this.messageFormatter.formatMessage(this.error.merchantMessage, this.error),
      actions: this.transactionResult.actions,
      externalUrl: generatePaymentIntentAdyenDashboardUrl(
        this.adyenPaymentIntentId,
        this.appContext.adyenEnv,
      ),
    };

    return Response.json(typeSafeResponse, { status: this.statusCode });
  }
}

export const TransactionCancelationRequestedUseCaseResponses = {
  Success,
  Failure,
};

export type TransactionCancelationRequestedUseCaseResponsesType = InstanceType<
  | typeof TransactionCancelationRequestedUseCaseResponses.Success
  | typeof TransactionCancelationRequestedUseCaseResponses.Failure
>;
