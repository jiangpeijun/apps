// apps\adyen\src\app\api\webhooks\saleor\transaction-initialize-session\event-data-parser.ts
import { err, ok } from "neverthrow";
import { z } from "zod";

import { BaseError } from "@/lib/errors";
import { ApplePayPaymentMethod } from "@/modules/adyen/payment-methods/apple-pay";
import { CardPaymentMethod } from "@/modules/adyen/payment-methods/card";
import { GooglePayPaymentMethod } from "@/modules/adyen/payment-methods/google-pay";
import { KlarnaPaymentMethod } from "@/modules/adyen/payment-methods/klarna";
import { LinkPaymentMethod } from "@/modules/adyen/payment-methods/link";
import { MobilePayPaymentMethod } from "@/modules/adyen/payment-methods/mobilepay";
import { PayByBankPaymentMethod } from "@/modules/adyen/payment-methods/pay-by-bank";
import { PayPalPaymentMethod } from "@/modules/adyen/payment-methods/paypal";
import { RevolutPayPaymentMethod } from "@/modules/adyen/payment-methods/revolut-pay";
import { SepaDebitPaymentMethod } from "@/modules/adyen/payment-methods/sepa-debit";
import { USBankAccountPaymentMethod } from "@/modules/adyen/payment-methods/us-bank-account";

// const TransactionInitializeEventDataSchema = z
//   .object({
//     paymentIntent: z.discriminatedUnion("paymentMethod", [
//       CardPaymentMethod.TransactionInitializeSchema,
//       KlarnaPaymentMethod.TransactionInitializeSchema,
//       GooglePayPaymentMethod.TransactionInitializeSchema,
//       ApplePayPaymentMethod.TransactionInitializeSchema,
//       PayPalPaymentMethod.TransactionInitializeSchema,
//       USBankAccountPaymentMethod.TransactionInitializeSchema,
//       SepaDebitPaymentMethod.TransactionInitializeSchema,
//       LinkPaymentMethod.TransactionInitializeSchema,
//       PayByBankPaymentMethod.TransactionInitializeSchema,
//       MobilePayPaymentMethod.TransactionInitializeSchema,
//       RevolutPayPaymentMethod.TransactionInitializeSchema,
//     ]),
//   })
//   .strict()
//   .brand("TransactionInitializeRequestData");

// 明确定义 Drop-in 传来的数据结构
const TransactionInitializeEventDataSchema = z.object({
  paymentMethod: z.object({
    type: z.string(),
  }).passthrough(), // 允许包含 encryptedCardNumber 等加密字段
  browserInfo: z.record(z.any()).optional(),
  origin: z.string().optional(),
}).passthrough();

export const ParseErrorPublicCode = "ParseError" as const;
export const UnsupportedPaymentMethodErrorPublicCode = "UnsupportedPaymentMethodError" as const;

export const ParseError = BaseError.subclass("ParseError", {
  props: {
    _internalName: "TransactionInitializeEventDataParseError" as const,
    publicCode: ParseErrorPublicCode,
    publicMessage:
      "Provided data is invalid. Check your data argument to transactionInitializeSession mutation and try again.",
    merchantMessage: "Payment intent not created - storefront sent invalid data",
  },
});

export const UnsupportedPaymentMethodError = ParseError.subclass("UnsupportedPaymentMethodError", {
  props: {
    _internalName: "TransactionInitializeEventDataUnsupportedPaymentMethodError" as const,
    publicCode: UnsupportedPaymentMethodErrorPublicCode,
    publicMessage: "Provided payment method is not supported",
    merchantMessage: "Payment intent not created - provided payment method is not supported",
  },
});

export const parseTransactionInitializeSessionEventData = (raw: unknown) => {
  const parsingResult = TransactionInitializeEventDataSchema.safeParse(raw);

  if (parsingResult.success) {
    return ok(parsingResult.data);
  }

  const hasInvalidUnionDiscriminator = parsingResult.error.issues.some(
    (issue) => issue.code === "invalid_union_discriminator",
  );

  if (hasInvalidUnionDiscriminator) {
    const attemptedMethod =
      raw != null &&
      typeof raw === "object" &&
      "paymentIntent" in raw &&
      raw.paymentIntent != null &&
      typeof raw.paymentIntent === "object" &&
      "paymentMethod" in raw.paymentIntent &&
      typeof raw.paymentIntent.paymentMethod === "string"
        ? raw.paymentIntent.paymentMethod
        : "unknown";

    return err(
      new UnsupportedPaymentMethodError("Payment method is not supported", {
        cause: parsingResult.error,
        props: {
          data: raw,
          publicMessage: `Payment method "${attemptedMethod}" is not supported. Contact Saleor for assistance.`,
          merchantMessage: `Payment intent not created - payment method "${attemptedMethod}" is not supported`,
        },
      }),
    );
  }

  return err(new ParseError("Invalid data", { cause: parsingResult.error }));
};

export type TransactionInitializeSessionEventData = z.infer<
  typeof TransactionInitializeEventDataSchema
>;

export type TransactionInitializeSessionEventDataError =
  | InstanceType<typeof ParseError>
  | InstanceType<typeof UnsupportedPaymentMethodError>;
