// apps/adyen/src/modules/adyen/adyen-api-error.ts
import { captureException } from "@sentry/nextjs";
import { BaseError } from "@/lib/errors";

export const AdyenCardErrorPublicCode = "AdyenCardError" as const;
export const AdyenApiErrorPublicCode = "AdyenApiError" as const;

export type AdyenApiError = InstanceType<typeof AdyenAPIError>;

export const AdyenAPIError = BaseError.subclass("AdyenAPIError", {
  props: {
    _internalName: "AdyenAPIError" as const,
    publicCode: AdyenApiErrorPublicCode,
    publicMessage: "There is a problem with the request to Adyen API",
    merchantMessage: "There is a problem with the request to Adyen API",
  },
});

// 简化的映射函数，不再依赖旧的 'adyen' 包
export const mapAdyenErrorToApiError = (error: unknown): AdyenApiError => {
  if (error instanceof BaseError) {
    return error as AdyenApiError;
  }
  
  captureException(error);
  const message = error instanceof Error ? error.message : "Unknown error";
  
  return new AdyenAPIError(message, {
    cause: error,
  });
};