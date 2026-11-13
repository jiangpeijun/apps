import { describe, expect, it } from "vitest";

import { inferAdyenEnvFromKeys } from "./infer-adyen-env-from-keys";

describe("inferAdyenEnvFromKeys", () => {
  it("stays silent when both fields are empty", () => {
    expect(inferAdyenEnvFromKeys({ publishableKey: "", restrictedKey: "" })).toBeNull();
  });

  it("reads sandbox from a pasted publishable key", () => {
    expect(inferAdyenEnvFromKeys({ publishableKey: "pk_test_abc", restrictedKey: "" })).toBe(
      "TEST",
    );
  });

  it("reads live from a pasted restricted key", () => {
    expect(inferAdyenEnvFromKeys({ publishableKey: "", restrictedKey: "rk_live_abc" })).toBe(
      "LIVE",
    );
  });

  it("ignores incomplete prefixes so typing pk_t does not flash a pill", () => {
    expect(inferAdyenEnvFromKeys({ publishableKey: "pk_test", restrictedKey: "" })).toBeNull();
  });

  it("stays silent when the two keys disagree", () => {
    expect(
      inferAdyenEnvFromKeys({ publishableKey: "pk_test_abc", restrictedKey: "rk_live_abc" }),
    ).toBeNull();
  });

  it("trims pasted whitespace", () => {
    expect(inferAdyenEnvFromKeys({ publishableKey: "  pk_live_abc\n", restrictedKey: "" })).toBe(
      "LIVE",
    );
  });

  it("treats undefined watch values as empty", () => {
    expect(
      inferAdyenEnvFromKeys({ publishableKey: undefined, restrictedKey: undefined }),
    ).toBeNull();
  });

  it("keeps the saved environment when the restricted key is left empty on edit", () => {
    expect(
      inferAdyenEnvFromKeys({
        publishableKey: "pk_test_abc",
        restrictedKey: "",
        keptRestrictedKeyEnv: "TEST",
      }),
    ).toBe("TEST");
  });

  it("hides the pill when only the publishable key switches environment on edit", () => {
    expect(
      inferAdyenEnvFromKeys({
        publishableKey: "pk_live_abc",
        restrictedKey: "",
        keptRestrictedKeyEnv: "TEST",
      }),
    ).toBeNull();
  });
});
