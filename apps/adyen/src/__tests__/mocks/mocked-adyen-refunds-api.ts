import { vi } from "vitest";

import { type IAdyenRefundsApi } from "@/modules/adyen/types";

export const mockedAdyenRefundsApi = {
  createRefund: vi.fn(),
} satisfies IAdyenRefundsApi;
