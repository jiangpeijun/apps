import { type Result } from "neverthrow";
import type Adyen from "adyen";

import { BaseError } from "@/lib/errors";
import { type SaleorTransationId } from "@/modules/saleor/saleor-transaction-id";
import { type AdyenWebhookSecret } from "@/modules/adyen/adyen-webhook-secret";

import { type AdyenMoney } from "./adyen-money";
import { type AdyenPaymentIntentId } from "./adyen-payment-intent-id";
import { type AdyenRestrictedKey } from "./adyen-restricted-key";

export interface IAdyenPaymentIntentsApiFactory {
  create(args: { key: AdyenRestrictedKey }): IAdyenPaymentIntentsApi;
}

export interface IAdyenRefundsApiFactory {
  create(args: { key: AdyenRestrictedKey }): IAdyenRefundsApi;
}

export interface IAdyenRefundsApi {
  createRefund(args: {
    paymentIntentId: AdyenPaymentIntentId;
    adyenMoney: AdyenMoney;
    idempotencyKey: string | undefined;
    metadata?: AllowedAdyenObjectMetadata;
  }): Promise<Result<Adyen.Refund, unknown>>;
}

/**
 * Fixed metadata keys that are allowed on Adyen objects - intent and refund.
 */
export type AllowedAdyenObjectMetadata = {
  saleor_transaction_id?: SaleorTransationId;
  saleor_source_id?: string;
  saleor_source_type?: "Checkout" | "Order";
  saleor_api_url?: string;
  saleor_app_id?: string;
  saleor_order_id?: string;
  saleor_order_number?: string;
  saleor_checkout_id?: string;
};

export interface CreatePaymentIntentArgs {
  adyenMoney: AdyenMoney;
  intentParams: Pick<
    Adyen.PaymentIntentCreateParams,
    | "automatic_payment_methods"
    | "payment_method_options"
    | "confirm"
    | "payment_method"
    | "return_url"
    | "description"
  >;
  idempotencyKey: string;
  metadata?: AllowedAdyenObjectMetadata;
}

export interface IAdyenPaymentIntentsApi {
  createPaymentIntent(
    args: CreatePaymentIntentArgs,
  ): Promise<Result<Adyen.PaymentIntent, unknown>>;
  getPaymentIntent(args: {
    id: AdyenPaymentIntentId;
  }): Promise<Result<Adyen.PaymentIntent, unknown>>;
  capturePaymentIntent(args: {
    id: AdyenPaymentIntentId;
    idempotencyKey: string | undefined;
    metadata?: AllowedAdyenObjectMetadata;
  }): Promise<Result<Adyen.PaymentIntent, unknown>>;
  cancelPaymentIntent(args: {
    id: AdyenPaymentIntentId;
    idempotencyKey: string | undefined;
  }): Promise<Result<Adyen.PaymentIntent, unknown>>;
}

export interface IAdyenEventVerify {
  verifyEvent({
    signatureHeader,
    webhookSecret,
    rawBody,
  }: {
    rawBody: string;
    signatureHeader: string;
    webhookSecret: AdyenWebhookSecret;
  }): Result<Adyen.Event, InstanceType<typeof AdyenEventParsingError>>;
}

export const AdyenEventParsingError = BaseError.subclass("AdyenEventParsingError", {
  props: {
    internalName: "AdyenEventParsingError" as const,
  },
});
