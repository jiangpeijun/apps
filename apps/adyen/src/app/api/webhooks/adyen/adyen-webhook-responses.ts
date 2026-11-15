/**
 * TODO: Verify if this is actually non-retryable. Adyen retries every non-2xx response (4xx included),
 * so these responses are probably retried for up to 3 days. See https://docs.adyen.com/webhooks#automatic-retries
 */
abstract class NonRetryableErrorWebhookResponse {
  statusCode = 400;
}

abstract class RetryableErrorWebhookResponse {
  statusCode = 500;
}

export class AdyenWebhookSuccessResponse {
  readonly statusCode = 200;
  readonly message = "Ok";

  getResponse() {
    return new Response(this.message, {
      status: this.statusCode,
    });
  }
}

export class AdyenWebhookMalformedRequestResponse extends NonRetryableErrorWebhookResponse {
  readonly message = "Malformed request";

  getResponse() {
    return new Response(this.message, {
      status: this.statusCode,
    });
  }
}

export class AdyenWebhookAppIsNotConfiguredResponse extends NonRetryableErrorWebhookResponse {
  readonly message = "App is not configured";

  getResponse() {
    return new Response(this.message, {
      status: this.statusCode,
    });
  }
}

export class AdyenWebhookSeverErrorResponse extends RetryableErrorWebhookResponse {
  readonly message = "Server error";

  getResponse() {
    return new Response(this.message, {
      status: this.statusCode,
    });
  }
}

export class AdyenWebhookTransactionMissingResponse extends NonRetryableErrorWebhookResponse {
  readonly message = "Transaction is missing";

  getResponse() {
    return new Response(this.message, {
      status: this.statusCode,
    });
  }
}

export type PossibleAdyenWebhookSuccessResponses = AdyenWebhookSuccessResponse;

export type PossibleAdyenWebhookErrorResponses =
  | AdyenWebhookMalformedRequestResponse
  | AdyenWebhookAppIsNotConfiguredResponse
  | AdyenWebhookSeverErrorResponse
  | AdyenWebhookTransactionMissingResponse;
