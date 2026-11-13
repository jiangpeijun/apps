import Adyen from "adyen";
import { describe, expect, it } from "vitest";

import {
  mapAdyenErrorToApiError,
  AdyenAPIError,
  AdyenAuthenticationError,
  AdyenCardError,
  AdyenConnectionError,
  AdyenIdempotencyError,
  AdyenInvalidRequestError,
  AdyenPermissionError,
  AdyenRateLimitError,
  AdyenUnknownAPIError,
} from "./adyen-api-error";

describe("mapAdyenErrorToApiError", () => {
  it("maps Adyen.errors.AdyenCardError to app AdyenCardError", () => {
    const adyenError = new Adyen.errors.AdyenCardError({
      message: "Card declined",
      type: "card_error",
      code: "card_declined",
    });

    const result = mapAdyenErrorToApiError(adyenError);

    expect(result).toBeInstanceOf(AdyenCardError);
  });

  it("maps Adyen.errors.AdyenInvalidRequestError to AdyenInvalidRequestError", () => {
    const adyenError = new Adyen.errors.AdyenInvalidRequestError({
      message: "Missing required param",
      type: "invalid_request_error",
      param: "amount",
      code: "param_required",
    });

    const result = mapAdyenErrorToApiError(adyenError);

    expect(result).toBeInstanceOf(AdyenInvalidRequestError);
  });

  it("maps Adyen.errors.AdyenRateLimitError to AdyenRateLimitError", () => {
    const adyenError = new Adyen.errors.AdyenRateLimitError({
      message: "Too many requests",
      type: "rate_limit_error",
    });

    const result = mapAdyenErrorToApiError(adyenError);

    expect(result).toBeInstanceOf(AdyenRateLimitError);
  });

  it("maps Adyen.errors.AdyenConnectionError to AdyenConnectionError", () => {
    const adyenError = new Adyen.errors.AdyenConnectionError({
      message: "Connection failed",
      type: "api_error",
    });

    const result = mapAdyenErrorToApiError(adyenError);

    expect(result).toBeInstanceOf(AdyenConnectionError);
    expect(result.message).toMatchInlineSnapshot(`
      "Error: Connection failed
      There was a network problem between app and Adyen"
    `);
  });

  it("maps Adyen.errors.AdyenAPIError to AdyenAPIError", () => {
    const adyenError = new Adyen.errors.AdyenAPIError({
      message: "API error",
      type: "api_error",
    });

    const result = mapAdyenErrorToApiError(adyenError);

    expect(result).toBeInstanceOf(AdyenAPIError);
  });

  it("maps Adyen.errors.AdyenAuthenticationError to AdyenAuthenticationError", () => {
    const adyenError = new Adyen.errors.AdyenAuthenticationError({
      message: "Auth error",
      type: "authentication_error",
    });

    const result = mapAdyenErrorToApiError(adyenError);

    expect(result).toBeInstanceOf(AdyenAuthenticationError);
  });

  it("maps Adyen.errors.AdyenPermissionError to AdyenPermissionError", () => {
    const adyenError = new Adyen.errors.AdyenPermissionError({
      message: "Permission error",
      type: "invalid_request_error",
    });

    const result = mapAdyenErrorToApiError(adyenError);

    expect(result).toBeInstanceOf(AdyenPermissionError);
  });

  it("maps Adyen.errors.AdyenIdempotencyError to AdyenIdempotencyError", () => {
    const adyenError = new Adyen.errors.AdyenIdempotencyError({
      message: "Idempotency error",
      type: "idempotency_error",
    });

    const result = mapAdyenErrorToApiError(adyenError);

    expect(result).toBeInstanceOf(AdyenIdempotencyError);
  });

  it("maps unknown error to AdyenUnknownAPIError", () => {
    const unknownError = new Error("Unknown error");

    const result = mapAdyenErrorToApiError(unknownError);

    expect(result).toBeInstanceOf(AdyenUnknownAPIError);
  });
});
