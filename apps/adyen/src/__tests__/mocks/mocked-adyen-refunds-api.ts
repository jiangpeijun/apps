import { vi } from "vitest";

import { type IStripeRefundsApi } from "@/modules/adyen/types";

export const mockedStripeRefundsApi = {
  createRefund: vi.fn(),
} satisfies IStripeRefundsApi;
