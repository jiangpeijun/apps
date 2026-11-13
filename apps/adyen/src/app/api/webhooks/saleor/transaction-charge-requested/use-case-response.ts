import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import {
  type TransactionChargeRequestedSyncFailure,
  type TransactionChargeRequestedSyncSuccess,
} from "@/generated/app-webhooks-types/transaction-charge-requested";
import { type AppContext } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { type SaleorMoney } from "@/modules/saleor/saleor-money";
import { generatePaymentIntentAdyenDashboardUrl } from "@/modules/adyen/generate-adyen-dashboard-urls";
import { type AdyenApiError } from "@/modules/adyen/adyen-api-error";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";
import { type ChargeFailureResult } from "@/modules/transaction-result/failure-result";
import { type ChargeSuccessResult } from "@/modules/transaction-result/success-result";

class Success extends SuccessWebhookResponse {
  readonly transactionResult: ChargeSuccessResult;
  readonly saleorMoney: SaleorMoney;
  readonly adyenPaymentIntentId: AdyenPaymentIntentId;

  constructor(args: {
    transactionResult: ChargeSuccessResult;
    saleorMoney: SaleorMoney;
    adyenPaymentIntentId: AdyenPaymentIntentId;
    appContext: AppContext;
  }) {
    super(args.appContext);
    this.transactionResult = args.transactionResult;
    this.saleorMoney = args.saleorMoney;
    this.adyenPaymentIntentId = args.adyenPaymentIntentId;
  }

  getResponse(): Response {
    if (!this.appContext.adyenEnv) {
      throw new BaseError("Adyen environment is not set. Ensure AppContext is set earlier");
    }

    const typeSafeResponse: TransactionChargeRequestedSyncSuccess = {
      result: this.transactionResult.result,
      amount: this.saleorMoney.amount,
      pspReference: this.adyenPaymentIntentId,
      message: this.messageFormatter.formatMessage(this.transactionResult.message),
      actions: this.transactionResult.actions,
      externalUrl: generatePaymentIntentAdyenDashboardUrl(
        this.adyenPaymentIntentId,
        this.appContext.adyenEnv,
      ),
    };

    return Response.json(typeSafeResponse, { status: this.statusCode });
  }
}

class Failure extends SuccessWebhookResponse {
  readonly transactionResult: ChargeFailureResult;
  readonly error: AdyenApiError;
  readonly adyenPaymentIntentId: AdyenPaymentIntentId;

  constructor(args: {
    error: AdyenApiError;
    transactionResult: ChargeFailureResult;
    adyenPaymentIntentId: AdyenPaymentIntentId;
    appContext: AppContext;
  }) {
    super(args.appContext);
    this.error = args.error;
    this.transactionResult = args.transactionResult;
    this.adyenPaymentIntentId = args.adyenPaymentIntentId;
  }

  getResponse(): Response {
    if (!this.appContext.adyenEnv) {
      throw new BaseError("Adyen environment is not set. Ensure AppContext is set earlier");
    }

    const typeSafeResponse: TransactionChargeRequestedSyncFailure = {
      result: this.transactionResult.result,
      pspReference: this.adyenPaymentIntentId,
      message: this.messageFormatter.formatMessage(this.transactionResult.message, this.error),
      actions: this.transactionResult.actions,
      externalUrl: generatePaymentIntentAdyenDashboardUrl(
        this.adyenPaymentIntentId,
        this.appContext.adyenEnv,
      ),
    };

    return Response.json(typeSafeResponse, { status: this.statusCode });
  }
}

export const TransactionChargeRequestedUseCaseResponses = {
  Success,
  Failure,
};

export type TransactionChargeRequestedUseCaseResponsesType = InstanceType<
  | typeof TransactionChargeRequestedUseCaseResponses.Success
  | typeof TransactionChargeRequestedUseCaseResponses.Failure
>;
