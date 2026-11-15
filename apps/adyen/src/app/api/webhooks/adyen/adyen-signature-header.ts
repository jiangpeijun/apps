import { err, ok, type Result } from "neverthrow";

import { BaseError } from "@/lib/errors";

export const adyenSignatureHeader = "adyen-signature";

export const MissingAdyenHeaderError = BaseError.subclass("MissingAdyenHeaderError", {
  props: {
    _internalName: "MissingAdyenHeaderError",
  },
});

export function getAndParseAdyenSignatureHeader(
  headers: Headers,
): Result<string, InstanceType<typeof MissingAdyenHeaderError>> {
  const signatureHeader = headers.get(adyenSignatureHeader);

  if (signatureHeader && signatureHeader.length > 0) {
    return ok(signatureHeader);
  } else {
    return err(new MissingAdyenHeaderError("Adyen-Signature header is invalid"));
  }
}
