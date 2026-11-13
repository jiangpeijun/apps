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
  switch (eventData.paymentIntent.paymentMethod) {
    case "card":
      return new CardPaymentMethod();
    case "klarna":
      return new KlarnaPaymentMethod();
    case "google_pay":
      return new GooglePayPaymentMethod();
    case "apple_pay":
      return new ApplePayPaymentMethod();
    case "paypal":
      return new PayPalPaymentMethod();
    case "us_bank_account":
      return new USBankAccountPaymentMethod();
    case "sepa_debit":
      return new SepaDebitPaymentMethod();
    case "link":
      return new LinkPaymentMethod();
    case "pay_by_bank":
      return new PayByBankPaymentMethod();
    case "mobilepay":
      return new MobilePayPaymentMethod();
    case "revolut_pay":
      return new RevolutPayPaymentMethod();
    default:
      assertUnreachable(eventData.paymentIntent);
  }
};
