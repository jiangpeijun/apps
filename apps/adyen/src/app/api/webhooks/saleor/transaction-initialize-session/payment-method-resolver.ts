// apps/adyen/src/app/api/webhooks/saleor/transaction-initialize-session/payment-method-resolver.ts
import { assertUnreachable } from "@/lib/assert-unreachable";
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
import { type TransactionInitializeSessionEventData } from "./event-data-parser";

export const resolvePaymentMethodFromEventData = (
  eventData: TransactionInitializeSessionEventData,
) => {
  // 👈 修复：直接从 paymentMethod.type 获取，而不是 paymentIntent.paymentMethod
  const methodType = eventData.paymentMethod.type;

  switch (methodType) {
    case "scheme": // Adyen 的卡支付类型叫 scheme
    case "card":
      return new CardPaymentMethod();
    case "klarna":
      return new KlarnaPaymentMethod();
    case "googlepay": // Adyen 的 Google Pay 叫 googlepay
    case "google_pay":
      return new GooglePayPaymentMethod();
    case "applepay": // Adyen 的 Apple Pay 叫 applepay
    case "apple_pay":
      return new ApplePayPaymentMethod();
    case "paypal":
      return new PayPalPaymentMethod();
    case "us_bank_account":
      return new USBankAccountPaymentMethod();
    case "sepadirectdebit":
    case "sepa_debit":
      return new SepaDebitPaymentMethod();
    case "link":
      return new LinkPaymentMethod();
    case "paybybank":
    case "pay_by_bank":
      return new PayByBankPaymentMethod();
    case "mobilepay":
      return new MobilePayPaymentMethod();
    case "revolutpay":
    case "revolut_pay":
      return new RevolutPayPaymentMethod();
    default:
      // 对于不支持的类型，返回 null 或抛出错误
      return null; 
  }
};