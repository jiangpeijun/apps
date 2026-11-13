import { vi } from "vitest";

import { type IAdyenPaymentIntentsApi } from "@/modules/adyen/types";

export const mockedAdyenPaymentIntentsApi = {
  createPaymentIntent: vi.fn(),
  getPaymentIntent: vi.fn(),
  capturePaymentIntent: vi.fn(),
  cancelPaymentIntent: vi.fn(),
} satisfies IAdyenPaymentIntentsApi;
