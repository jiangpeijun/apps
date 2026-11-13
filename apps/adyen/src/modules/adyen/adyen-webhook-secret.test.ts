import { describe, expect, it } from "vitest";

import {
  createAdyenWebhookSecret,
  type AdyenWebhookSecret,
  AdyenWebhookSecretValidationError,
} from "@/modules/adyen/adyen-webhook-secret";

describe("AdyenWebhookSecret", () => {
  it("Creates from valid string", () => {
    const brandedString = createAdyenWebhookSecret("whsec_XYZ")._unsafeUnwrap();

    expect(brandedString).toStrictEqual("whsec_XYZ");
  });
  it("Creates from unexpected valid string", () => {
    const brandedString = createAdyenWebhookSecret("unexpected_prefix_xyz")._unsafeUnwrap();

    expect(brandedString).toStrictEqual("unexpected_prefix_xyz");
  });

  it("Throws if empty value passed", () => {
    expect(createAdyenWebhookSecret("")._unsafeUnwrapErr()).toBeInstanceOf(
      AdyenWebhookSecretValidationError,
    );
  });

  it("Nominal typing works", () => {
    const fn = (v: AdyenWebhookSecret) => v;

    // @ts-expect-error - should be error, only string must be accepted
    fn("whsec_XXX");

    expect(() => fn(createAdyenWebhookSecret("whsec_XXX")._unsafeUnwrap())).not.toThrow();
  });
});
