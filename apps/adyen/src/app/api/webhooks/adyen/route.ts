// apps/adyen/src/app/api/webhooks/adyen/route.ts
import { hmacValidator } from "@adyen/api-library";
import { env } from "@/lib/env";
import { getTransactionMapping } from "@/modules/adyen/transaction-recorder";
import { createInstrumentedGraphqlClient } from "@/lib/graphql-client";
import { TransactionEventReportDocument } from "@/generated/graphql";

interface AdyenNotificationItem {
  eventCode: string;
  merchantAccountCode: string;
  merchantReference: string;
  pspReference: string;
  success: string;
  eventDate?: string;
  reason?: string;
  amount: { currency: string; value: number };
  additionalData?: Record<string, string>;
}

interface AdyenWebhookBody {
  live?: string;
  notificationItems: Array<{ NotificationRequestItem: AdyenNotificationItem }>;
}

type SaleorEventType = "CHARGE_SUCCESS" | "CHARGE_FAILURE" | "REFUND_SUCCESS" | "CANCEL_SUCCESS";

const TRANSACTION_EVENTS_QUERY = /* GraphQL */ `
  query AdyenTransactionEventsForIdempotency($id: ID!) {
    transaction(id: $id) {
      id
      events {
        pspReference
        type
      }
    }
  }
`;

/**
 * Adyen 的 amount.value 是最小货币单位（minor units）。
 * 不能用固定的 /100：
 * - JPY / KRW 等零小数币种，value 就是主单位（3 表示 ¥3）
 * - BHD / KWD 等三位小数币种要 /1000
 */
function currencyExponent(currency: string): number {
  try {
    const formatter = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    });

    return formatter.resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function toMajorUnits(valueInMinorUnits: number, currency: string): number {
  if (!Number.isFinite(valueInMinorUnits)) return 0;

  const exponent = currencyExponent(currency);
  const factor = 10 ** exponent;

  return Number((valueInMinorUnits / factor).toFixed(exponent));
}

/** Adyen 事件 → Saleor 交易事件类型；不映射的事件返回 null（避免重复计费） */
function resolveSaleorEventType(eventCode: string, success: string): SaleorEventType | null {
  const succeeded = success === "true";

  switch (eventCode) {
    case "AUTHORISATION":
      return succeeded ? "CHARGE_SUCCESS" : "CHARGE_FAILURE";
    case "REFUND":
      return succeeded ? "REFUND_SUCCESS" : null;
    case "CANCELLATION":
      return succeeded ? "CANCEL_SUCCESS" : null;
    // CAPTURE / CAPTURE_FAILED / AUTHORISATION_ADJUSTMENT：
    // Saleor 侧已由 CHARGE_SUCCESS 记账，再映射一次会重复计入 chargedAmount
    case "CAPTURE":
    case "CAPTURE_FAILED":
    case "AUTHORISATION_ADJUSTMENT":
    case "CHARGEBACK":
    case "CHARGEBACK_REVERSED":
      return null;
    default:
      return null;
  }
}

function isAlreadyExistsError(code?: string | null, message?: string | null): boolean {
  const text = `${code ?? ""} ${message ?? ""}`;

  return /already\s*exists/i.test(text) || /ALREADY_EXISTS|UNIQUE/i.test(text);
}

/** 幂等预检查：同 pspReference + type 已存在就不再上报 */
async function hasExistingEvent(
  client: any,
  transactionId: string,
  pspReference: string,
  type: SaleorEventType,
): Promise<boolean> {
  try {
    const result = await client.query(TRANSACTION_EVENTS_QUERY, { id: transactionId }).toPromise();

    if (result?.error) {
      console.warn("[adyen-webhook] 幂等预检查查询失败，继续按正常流程上报:", result.error.message);
      return false;
    }

    const events =
      (result?.data as
        | { transaction?: { events?: Array<{ pspReference?: string | null; type?: string | null }> } | null }
        | null
        | undefined)?.transaction?.events ?? [];

    return events.some((event) => event.pspReference === pspReference && event.type === type);
  } catch (error) {
    console.warn("[adyen-webhook] 幂等预检查异常，继续按正常流程上报:", error);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AdyenWebhookBody;
    const notificationItems = body.notificationItems ?? [];
    const validator = new hmacValidator();
    const hmacKey = env.ADYEN_HMAC_KEY ?? "";

    if (!hmacKey) {
      console.error("❌ ADYEN_HMAC_KEY 未配置，所有通知都会被跳过");
    }

    for (const item of notificationItems) {
      const notification = item?.NotificationRequestItem;
      if (!notification) continue;

      try {
        // 1. HMAC 校验
        if (!hmacKey || !validator.validateHMAC(notification as any, hmacKey)) {
          console.warn("⚠️ Adyen HMAC 校验失败，忽略通知:", notification.pspReference);
          continue;
        }

        // 2. 事件映射
        const saleorEventType = resolveSaleorEventType(notification.eventCode, notification.success);

        if (!saleorEventType) {
          console.info(
            "[adyen-webhook] 忽略未映射事件:",
            notification.eventCode,
            notification.pspReference,
          );
          continue;
        }

        // 3. 从 DynamoDB 取出 transactionId 与 Saleor 凭据
        const transactionRecord = await getTransactionMapping(notification.pspReference);

        if (!transactionRecord?.transactionId) {
          console.error(`❌ 找不到对应的 Saleor 交易: ${notification.pspReference}`);
          continue;
        }

        const client = createInstrumentedGraphqlClient({
          saleorApiUrl: transactionRecord.saleorApiUrl,
          token: transactionRecord.token,
        });

        // 4. 幂等：同步链路已由 transactionInitialize 上报过 CHARGE_SUCCESS，
        //    这里再报一次会被 Saleor 判为重复，并留下一条 FAILURE 记录
        if (
          await hasExistingEvent(
            client,
            transactionRecord.transactionId,
            notification.pspReference,
            saleorEventType,
          )
        ) {
          console.info(
            `ℹ️ 事件已存在，跳过重复上报: ${saleorEventType} / ${notification.pspReference}`,
          );
          continue;
        }

        // 5. 金额按币种指数换算，绝不写死 /100
        const amount = toMajorUnits(
          notification.amount?.value,
          notification.amount?.currency ?? "JPY",
        );

        const result = await client
          .mutation(TransactionEventReportDocument, {
            transactionId: transactionRecord.transactionId,
            message: `Adyen webhook: ${notification.eventCode}${
              notification.reason ? ` (${notification.reason})` : ""
            }`,
            pspReference: notification.pspReference,
            type: saleorEventType,
            amount,
            time: notification.eventDate ?? new Date().toISOString(),
          })
          .toPromise();

        const payloadErrors =
          (
            result?.data as
              | {
                  transactionEventReport?: {
                    errors?: Array<{ code?: string | null; message?: string | null }>;
                  } | null;
                }
              | null
              | undefined
          )?.transactionEventReport?.errors ?? [];

        if (result?.error || payloadErrors.length > 0) {
          const first = payloadErrors[0];
          const message = first?.message ?? result?.error?.message ?? "UNKNOWN";

          if (isAlreadyExistsError(first?.code, message)) {
            console.info(
              `ℹ️ Saleor 判定事件已存在，按幂等成功处理: ${saleorEventType} / ${notification.pspReference}`,
            );
            continue;
          }

          console.error("❌ 通知 Saleor 失败:", {
            pspReference: notification.pspReference,
            type: saleorEventType,
            amount,
            code: first?.code,
            message,
          });
          continue;
        }

        console.log(
          `✅ 已同步 ${saleorEventType} 到 Saleor:`,
          notification.pspReference,
          `amount=${amount} ${notification.amount?.currency ?? ""}`,
        );
      } catch (itemError) {
        console.error("❌ 处理单条 Adyen 通知失败:", notification?.pspReference, itemError);
      }
    }

    // Adyen 要求返回纯文本 [accepted]
    return new Response("[accepted]", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("Adyen Webhook 解析错误:", error);
    return new Response("[accepted]", { status: 200 });
  }
}
