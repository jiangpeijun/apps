import { z } from "zod";

import {
  createFailureWebhookResponseDataSchema,
  createSuccessWebhookResponseDataSchema,
} from "@/app/api/webhooks/saleor/saleor-webhook-response-schema";
import { SuccessWebhookResponse } from "@/app/api/webhooks/saleor/saleor-webhook-responses";
import {
  type TransactionSessionActionRequired,
  type TransactionSessionFailure,
} from "@/generated/app-webhooks-types/transaction-initialize-session";
import { type AppContext } from "@/lib/app-context";
import { BaseError } from "@/lib/errors";
import { type SaleorMoney } from "@/modules/saleor/saleor-money";
import { generatePaymentIntentAdyenDashboardUrl } from "@/modules/adyen/generate-adyen-dashboard-urls";
import {
  type AdyenApiError,
  AdyenApiErrorPublicCode,
  AdyenCardErrorPublicCode,
} from "@/modules/adyen/adyen-api-error";
import {
  type AdyenClientSecret,
  AdyenClientSecretSchema,
} from "@/modules/adyen/adyen-client-secret";
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
  ParseErrorPublicCode,
  type TransactionInitializeSessionEventDataError,
  UnsupportedPaymentMethodErrorPublicCode,
} from "./event-data-parser";

class Success extends SuccessWebhookResponse {
  readonly transactionResult: ChargeActionRequiredResult | AuthorizationActionRequiredResult;
  readonly adyenClientSecret: AdyenClientSecret;
  readonly saleorMoney: SaleorMoney;
  readonly adyenPaymentIntentId: AdyenPaymentIntentId;

  private static ResponseDataSchema = createSuccessWebhookResponseDataSchema(
    z.object({
      adyenClientSecret: AdyenClientSecretSchema,
    }),
  );

  constructor(args: {
    transactionResult: ChargeActionRequiredResult | AuthorizationActionRequiredResult;
    adyenClientSecret: AdyenClientSecret;
    saleorMoney: SaleorMoney;
    adyenPaymentIntentId: AdyenPaymentIntentId;
    appContext: AppContext;
  }) {
    super(args.appContext);
    this.transactionResult = args.transactionResult;
    this.adyenClientSecret = args.adyenClientSecret;
    this.saleorMoney = args.saleorMoney;
    this.adyenPaymentIntentId = args.adyenPaymentIntentId;
  }

  getResponse() {
    if (!this.appContext.adyenEnv) {
      throw new BaseError("Adyen environment is not set. Ensure AppContext is set earlier");
    }

    const typeSafeResponse: TransactionSessionActionRequired = {
      data: Success.ResponseDataSchema.parse({
        paymentIntent: {
          adyenClientSecret: this.adyenClientSecret,
        },
      }),
      actions: this.transactionResult.actions,
      result: this.transactionResult.result,
      amount: this.saleorMoney.amount,
      pspReference: this.adyenPaymentIntentId,
      message: this.transactionResult.message,
      externalUrl: generatePaymentIntentAdyenDashboardUrl(
        this.adyenPaymentIntentId,
        this.appContext.adyenEnv,
      ),
    };

    return Response.json(typeSafeResponse, { status: this.statusCode });
  }
}

class Failure extends SuccessWebhookResponse {
  readonly transactionResult: ChargeFailureResult | AuthorizationFailureResult;
  readonly error: AdyenApiError | TransactionInitializeSessionEventDataError;

  private static ResponseDataSchema = createFailureWebhookResponseDataSchema(
    z.array(
      z.object({
        code: z.union([
          z.literal(ParseErrorPublicCode),
          z.literal(UnsupportedPaymentMethodErrorPublicCode),
          z.literal(AdyenCardErrorPublicCode),
          z.literal(AdyenApiErrorPublicCode),
        ]),
        message: z.string(),
      }),
    ),
  );

  constructor(args: {
    transactionResult: ChargeFailureResult | AuthorizationFailureResult;
    error: AdyenApiError | TransactionInitializeSessionEventDataError;
    appContext: AppContext;
  }) {
    super(args.appContext);
    this.transactionResult = args.transactionResult;
    this.error = args.error;
  }

  getResponse() {
    const typeSafeResponse: TransactionSessionFailure = {
      // We don't have pspReference in this case or actions because there is no payment intent created
      result: this.transactionResult.result,
      message: this.messageFormatter.formatMessage(this.error.publicMessage, this.error),
      actions: this.transactionResult.actions,
      data: Failure.ResponseDataSchema.parse({
        paymentIntent: {
          errors: [
            {
              code: this.error.publicCode,
              message: this.messageFormatter.formatMessage(this.error.publicMessage, this.error),
            },
          ],
        },
      }),
    };

    return Response.json(typeSafeResponse, { status: this.statusCode });
  }
}

export const TransactionInitializeSessionUseCaseResponses = {
  Success,
  Failure,
};

export type TransactionInitializeSessionUseCaseResponsesType = InstanceType<
  | typeof TransactionInitializeSessionUseCaseResponses.Success
  | typeof TransactionInitializeSessionUseCaseResponses.Failure
>;
