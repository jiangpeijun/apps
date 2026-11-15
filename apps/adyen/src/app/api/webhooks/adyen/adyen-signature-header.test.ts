import { describe, expect, it } from "vitest";

import { getAndParseAdyenSignatureHeader, adyenSignatureHeader } from "./adyen-signature-header";

describe("getAndParseAdyenSignatureHeader", () => {
  it("Returns raw value from headers", () => {
    expect(
      getAndParseAdyenSignatureHeader(
        new Headers({
          [adyenSignatureHeader]: "AABBCC",
        }),
      )._unsafeUnwrap(),
    ).toStrictEqual("AABBCC");
  });

  it("Throws if value is missing", () => {
    expect(
      getAndParseAdyenSignatureHeader(new Headers({}))._unsafeUnwrapErr(),
    ).toMatchInlineSnapshot(`[MissingAdyenHeaderError: Adyen-Signature header is invalid]`);
  });

  it("Throws if value is empty", () => {
    expect(
      getAndParseAdyenSignatureHeader(
        new Headers({
          [adyenSignatureHeader]: "",
        }),
      )._unsafeUnwrapErr(),
    ).toMatchInlineSnapshot(`[MissingAdyenHeaderError: Adyen-Signature header is invalid]`);
  });
});
