import { describe, expect, it } from "vitest";

import {
  getSaleorOrderAdyenDescription,
  getSaleorOrderAdyenMetadata,
} from "./saleor-order-adyen-metadata";

describe("getSaleorOrderAdyenMetadata", () => {
  it("Skips order number when it's not sent by outdated webhook subscription query", () => {
    expect(
      getSaleorOrderAdyenMetadata({ order: { id: "order-id" }, checkout: null }),
    ).toStrictEqual({ saleor_order_id: "order-id" });
    expect(getSaleorOrderAdyenDescription({})).toBeUndefined();
  });
});
