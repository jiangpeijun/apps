import { captureException } from "@sentry/nextjs";
import Adyen from "adyen";

import { BaseError } from "@/lib/errors";

export const AdyenCardErrorPublicCode = "AdyenCardError" as const;
export const AdyenApiErrorPublicCode = "AdyenApiError" as const;

export type AdyenApiError = InstanceType<
  | typeof AdyenCardError
  | typeof AdyenInvalidRequestError
  | typeof AdyenRateLimitError
  | typeof AdyenConnectionError
  | typeof AdyenAPIError
  | typeof AdyenAuthenticationError
  | typeof AdyenPermissionError
  | typeof AdyenIdempotencyError
  | typeof AdyenUnknownAPIError
>;

export const AdyenCardError = BaseError.subclass("AdyenCardError", {
  props: {
    _internalName: "AdyenPaymentIntentsApi.AdyenCardError" as const,
    publicCode: AdyenCardErrorPublicCode,
    publicMessage: "", // filed by Adyen - they recommend to show it to the storefront user
    merchantMessage: "There is problem with processing of the card",
  },
});

export const AdyenInvalidRequestError = BaseError.subclass("AdyenInvalidRequestError", {
  props: {
    _internalName: "AdyenPaymentIntentsApi.AdyenInvalidRequestError" as const,
    publicCode: AdyenApiErrorPublicCode,
    publicMessage: "There is a problem with the request to Adyen API",
    merchantMessage: "There is a problem with the request to Adyen API",
    adyenCode: "",
    adyenParam: "",
  },
});

export const AdyenRateLimitError = BaseError.subclass("AdyenRateLimitError", {
  props: {
    _internalName: "AdyenPaymentIntentsApi.AdyenRateLimitError" as const,
    publicCode: AdyenApiErrorPublicCode,
    publicMessage: "There is a problem with the request to Adyen API",
    merchantMessage: "There is a problem with the request to Adyen API",
  },
});

export const AdyenConnectionError = BaseError.subclass("AdyenConnectionError", {
  props: {
    _internalName: "AdyenPaymentIntentsApi.AdyenConnectionError" as const,
    publicCode: AdyenApiErrorPublicCode,
    publicMessage: "There is a problem with the request to Adyen API",
    merchantMessage: "There is a problem with the request to Adyen API",
  },
});

export const AdyenAPIError = BaseError.subclass("AdyenAPIError", {
  props: {
    _internalName: "AdyenPaymentIntentsApi.AdyenAPIError" as const,
    publicCode: AdyenApiErrorPublicCode,
    publicMessage: "There is a problem with the request to Adyen API",
    merchantMessage: "There is a problem with the request to Adyen API",
  },
});

export const AdyenAuthenticationError = BaseError.subclass("AdyenAuthenticationError", {
  props: {
    _internalName: "AdyenPaymentIntentsApi.AdyenAuthenticationError" as const,
    publicCode: AdyenApiErrorPublicCode,
    publicMessage: "There is a problem with the request to Adyen API",
    merchantMessage: "There is a problem with the request to Adyen API",
  },
});

export const AdyenPermissionError = BaseError.subclass("AdyenPermissionError", {
  props: {
    _internalName: "AdyenPaymentIntentsApi.AdyenPermissionError" as const,
    publicCode: AdyenApiErrorPublicCode,
    publicMessage: "There is a problem with the request to Adyen API",
    merchantMessage: "There is a problem with the request to Adyen API",
  },
});

export const AdyenIdempotencyError = BaseError.subclass("AdyenIdempotencyError", {
  props: {
    _internalName: "AdyenPaymentIntentsApi.AdyenIdempotencyError" as const,
    publicCode: AdyenApiErrorPublicCode,
    publicMessage: "There is a problem with the request to Adyen API",
    merchantMessage: "There is a problem with the request to Adyen API",
  },
});

export const AdyenUnknownAPIError = BaseError.subclass("AdyenUnknownAPIError", {
  props: {
    _internalName: "AdyenPaymentIntentsApi.AdyenUnknownAPIError" as const,
    publicCode: AdyenApiErrorPublicCode,
    publicMessage: "There is a problem with the request to Adyen API",
    merchantMessage: "There is a problem with the request to Adyen API",
  },
});

export const mapAdyenErrorToApiError = (error: unknown): AdyenApiError => {
  switch (true) {
    case error instanceof Adyen.errors.AdyenCardError:
      return new AdyenCardError("Card payment error", {
        cause: error,
        props: {
          publicMessage: error.message,
        },
      });
    case error instanceof Adyen.errors.AdyenInvalidRequestError:
      return new AdyenInvalidRequestError("Invalid parameters provided to Adyen API", {
        cause: error,
        props: {
          adyenCode: error.code ?? "",
          adyenParam: error.param ?? "",
        },
      });
    case error instanceof Adyen.errors.AdyenRateLimitError:
      return new AdyenRateLimitError("Too many requests made to the API too quickly", {
        cause: error,
      });
    case error instanceof Adyen.errors.AdyenConnectionError:
      return new AdyenConnectionError("There was a network problem between app and Adyen", {
        cause: error,
      });
    case error instanceof Adyen.errors.AdyenAPIError:
      return new AdyenAPIError("Something went wrong on Adyen end", {
        cause: error,
      });
    case error instanceof Adyen.errors.AdyenAuthenticationError:
      return new AdyenAuthenticationError("App can’t authenticate with Adyen", {
        cause: error,
      });
    case error instanceof Adyen.errors.AdyenPermissionError:
      return new AdyenPermissionError("API key doesn’t have permission to perform this action", {
        cause: error,
      });
    case error instanceof Adyen.errors.AdyenIdempotencyError:
      return new AdyenIdempotencyError("Idempotency key error", {
        cause: error,
      });
    default:
      captureException(error);

      return new AdyenUnknownAPIError("Unknown error", {
        cause: error,
      });
  }
};
