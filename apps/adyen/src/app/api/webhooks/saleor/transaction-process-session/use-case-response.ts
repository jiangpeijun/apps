import { z } from "zod";

import { createFailureWebhookResponseDataSchema } from "@/app/api/webhooks/saleor/saleor-webhook-response-schema";
import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import {
  type TransactionSessionActionRequired,
  type TransactionSessionFailure,
  type TransactionSessionSuccess,
} from "@/generated/app-webhooks-types/transaction-process-session";
import { type AppContext } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { type SaleorMoney } from "@/modules/saleor/saleor-money";
import { type SaleorPaymentMethodDetails } from "@/modules/saleor/saleor-payment-method-details";
import { generatePaymentIntentAdyenDashboardUrl } from "@/modules/adyen/generate-adyen-dashboard-urls";
import {
  type AdyenApiError,
  AdyenApiErrorPublicCode,
  AdyenCardErrorPublicCode,
} from "@/modules/adyen/adyen-api-error";
import { type AdyenPaymentIntentId } from "@/modules/adyen/adyen-payment-intent-id";
import {
  type AuthorizationActionRequiredResult,
  type ChargeActionRequiredResult,
} from "@/modules/transaction-result/action-required-result";
import {
  type AuthorizationFailureResult,
  type ChargeFailureResult,
} from "@/modules/transaction-result/failure-result";
import {
  type AuthorizationRequestResult,
  type ChargeRequestResult,
} from "@/modules/transaction-result/request-result";
import {
  type AuthorizationSuccessResult,
  type ChargeSuccessResult,
} from "@/modules/transaction-result/success-result";

type TransactionResult =
  | ChargeSuccessResult
  | AuthorizationSuccessResult
  | ChargeActionRequiredResult
  | AuthorizationActionRequiredResult
  | ChargeRequestResult
  | AuthorizationRequestResult;

class Success extends SuccessWebhookResponse {
  readonly transactionResult: TransactionResult;
  readonly saleorMoney: SaleorMoney;
  readonly timestamp: Date | null;
  readonly adyenPaymentIntentId: AdyenPaymentIntentId;
  readonly paymentMethodDetails: SaleorPaymentMethodDetails | null;

  constructor(args: {
    transactionResult: TransactionResult;
    saleorMoney: SaleorMoney;
    timestamp: Date | null;
    adyenPaymentIntentId: AdyenPaymentIntentId;
    appContext: AppContext;
    saleorPaymentMethodDetails: SaleorPaymentMethodDetails | null;
  }) {
    super(args.appContext);
    this.transactionResult = args.transactionResult;
    this.saleorMoney = args.saleorMoney;
    this.timestamp = args.timestamp;
    this.adyenPaymentIntentId = args.adyenPaymentIntentId;
    this.paymentMethodDetails = args.saleorPaymentMethodDetails;
  }

  getResponse(): Response {
    if (!this.appContext.adyenEnv) {
      throw new BaseError("Adyen environment is not set. Ensure AppContext is set earlier");
    }

    const typeSafeResponse: TransactionSessionSuccess | TransactionSessionActionRequired = {
      result: this.transactionResult.result,
      amount: this.saleorMoney.amount,
      pspReference: this.adyenPaymentIntentId,
      // https://docs.adyen.com/payments/paymentintents/lifecycle
      message: this.transactionResult.message,
      actions: this.transactionResult.actions,
      externalUrl: generatePaymentIntentAdyenDashboardUrl(
        this.adyenPaymentIntentId,
        this.appContext.adyenEnv,
      ),
      time: this.timestamp?.toISOString(),
      paymentMethodDetails: this.paymentMethodDetails?.toSaleorWebhookResponse(),
    };

    return Response.json(typeSafeResponse, { status: this.statusCode });
  }
}

class Failure extends SuccessWebhookResponse {
  readonly transactionResult: ChargeFailureResult | AuthorizationFailureResult;
  readonly error: AdyenApiError;
  readonly adyenPaymentIntentId: AdyenPaymentIntentId;

  private static ResponseDataSchema = createFailureWebhookResponseDataSchema(
    z.array(
      z.object({
        code: z.union([z.literal(AdyenCardErrorPublicCode), z.literal(AdyenApiErrorPublicCode)]),
        message: z.string(),
      }),
    ),
  );

  constructor(args: {
    transactionResult: ChargeFailureResult | AuthorizationFailureResult;
    error: AdyenApiError;
    adyenPaymentIntentId: AdyenPaymentIntentId;
    appContext: AppContext;
  }) {
    super(args.appContext);
    this.transactionResult = args.transactionResult;
    this.error = args.error;
    this.adyenPaymentIntentId = args.adyenPaymentIntentId;
  }

  getResponse() {
    if (!this.appContext.adyenEnv) {
      throw new BaseError("Adyen environment is not set. Ensure AppContext is set earlier");
    }

    const typeSafeResponse: TransactionSessionFailure = {
      result: this.transactionResult.result,
      message: this.error.merchantMessage,
      pspReference: this.adyenPaymentIntentId,
      externalUrl: generatePaymentIntentAdyenDashboardUrl(
        this.adyenPaymentIntentId,
        this.appContext.adyenEnv,
      ),
      data: Failure.ResponseDataSchema.parse({
        paymentIntent: {
          errors: [
            {
              code: this.error.publicCode,
              message: this.error.publicMessage,
            },
          ],
        },
      }),
      actions: this.transactionResult.actions,
    };

    return Response.json(typeSafeResponse, { status: this.statusCode });
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
