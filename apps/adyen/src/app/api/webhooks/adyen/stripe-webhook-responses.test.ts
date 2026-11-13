import { describe, expect, it } from "vitest";

import {
  AdyenWebhookAppIsNotConfiguredResponse,
  AdyenWebhookMalformedRequestResponse,
  AdyenWebhookSeverErrorResponse,
  AdyenWebhookSuccessResponse,
} from "./adyen-webhook-responses";

describe("AdyenWebhookSuccessResponse", () => {
  it("Returns response with status 200 and fixed message to Adyen", async () => {
    const response = new AdyenWebhookSuccessResponse().getResponse();

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toMatchInlineSnapshot(`"Ok"`);
  });
});

describe("AdyenWebhookMalformedRequestResponse", () => {
  it("Returns response with status 400 and fixed message to Adyen", async () => {
    const response = new AdyenWebhookMalformedRequestResponse().getResponse();

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toMatchInlineSnapshot(`"Malformed request"`);
  });
});

describe("AdyenWebhookAppIsNotConfiguredResponse", () => {
  it("Returns response with status 400 and fixed message to Adyen", async () => {
    const response = new AdyenWebhookAppIsNotConfiguredResponse().getResponse();

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toMatchInlineSnapshot(`"App is not configured"`);
  });
});

describe("AdyenWebhookSeverErrorResponse", () => {
  it("Returns response with status 500 and fixed message to Adyen", async () => {
    const response = new AdyenWebhookSeverErrorResponse().getResponse();

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toMatchInlineSnapshot(`"Server error"`);
  });
});
