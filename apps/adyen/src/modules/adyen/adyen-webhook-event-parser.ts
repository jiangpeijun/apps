import { z } from "zod";

// 定义 Adyen Webhook Payload 的 Zod Schema 用于校验
export const AdyenNotificationItemSchema = z.object({
  eventCode: z.string(),
  merchantAccountCode: z.string(),
  merchantReference: z.string().optional(),
  originalReference: z.string().optional(),
  pspReference: z.string(),
  success: z.string().transform((val) => val === "true"), // Adyen 返回的是字符串 "true" / "false"
  amount: z.object({
    currency: z.string(),
    value: z.number(),
  }).optional(),
  eventDate: z.string(),
  paymentMethod: z.string().optional(),
  reason: z.string().optional(),
  additionalData: z.record(z.string(), z.string()).optional(),
});

export type AdyenNotificationItem = z.infer<typeof AdyenNotificationItemSchema>;

export type ParsedAdyenEvent = {
  pspReference: string;
  merchantAccountCode: string;
  merchantReference: string | null;
  originalReference: string | null;
  eventCode: string;
  success: boolean;
  amount: { value: number; currency: string } | null;
  eventDate: string;
  reason: string | null;
};

/**
 * 解析并提取 Adyen 通知的核心字段
 */
export function parseAdyenNotification(rawNotification: any): ParsedAdyenEvent {
  const result = AdyenNotificationItemSchema.safeParse(rawNotification);

  if (!result.success) {
    throw new Error(`Invalid Adyen notification payload: ${result.error.message}`);
  }

  const data = result.data;

  return {
    pspReference: data.pspReference,
    merchantAccountCode: data.merchantAccountCode,
    merchantReference: data.merchantReference ?? null,
    originalReference: data.originalReference ?? null,
    eventCode: data.eventCode,
    success: data.success,
    amount: data.amount ?? null,
    eventDate: data.eventDate,
    reason: data.reason ?? null,
  };
}