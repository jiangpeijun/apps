import Adyen from "adyen";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockedConfigurationId, mockedSaleorAppId } from "@/__tests__/mocks/constants";
import { mockedAdyenPublishableKey } from "@/__tests__/mocks/mocked-adyen-publishable-key";
import { mockedAdyenRestrictedKey } from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { mockAdyenWebhookSecret } from "@/__tests__/mocks/adyen-webhook-secret";
import { AdyenClient } from "@/modules/adyen/adyen-client";
import { AdyenWebhookManager } from "@/modules/adyen/adyen-webhook-manager";

describe("AdyenWebhookManager", () => {
  const adyenSdkMock = new Adyen("test");
  const instance = new AdyenWebhookManager();

  beforeEach(() => {
    vi.spyOn(adyenSdkMock.webhookEndpoints, "create");
    vi.spyOn(adyenSdkMock.webhookEndpoints, "del");
    vi.spyOn(adyenSdkMock.webhookEndpoints, "retrieve");
    vi.spyOn(adyenSdkMock.webhookEndpoints, "update");

    vi.spyOn(AdyenClient, "createFromRestrictedKey").mockImplementation(
      () => new AdyenClient(adyenSdkMock),
    );
  });

  describe("isWebhookReachableWithKey", () => {
    it("Returns true when Adyen can retrieve the webhook", async () => {
      vi.mocked(adyenSdkMock.webhookEndpoints.retrieve).mockResolvedValueOnce({
        id: "we_123",
      } as unknown as Adyen.Response<Adyen.WebhookEndpoint>);

      const result = await instance.isWebhookReachableWithKey({
        webhookId: "we_123",
        restrictedKey: mockedAdyenRestrictedKey,
      });

      expect(result._unsafeUnwrap()).toBe(true);
      expect(adyenSdkMock.webhookEndpoints.retrieve).toHaveBeenCalledWith("we_123");
    });

    it("Returns false when the webhook is missing for that key (other account or mode)", async () => {
      vi.mocked(adyenSdkMock.webhookEndpoints.retrieve).mockRejectedValueOnce(
        new Adyen.errors.AdyenInvalidRequestError({
          message: "No such webhook endpoint",
          type: "invalid_request_error",
          code: "resource_missing",
        }),
      );

      const result = await instance.isWebhookReachableWithKey({
        webhookId: "we_123",
        restrictedKey: mockedAdyenRestrictedKey,
      });

      expect(result._unsafeUnwrap()).toBe(false);
    });

    it("Returns CantFetchWebhookError on any other Adyen failure", async () => {
      vi.mocked(adyenSdkMock.webhookEndpoints.retrieve).mockRejectedValueOnce(
        new Error("Adyen is down"),
      );

      const result = await instance.isWebhookReachableWithKey({
        webhookId: "we_123",
        restrictedKey: mockedAdyenRestrictedKey,
      });

      expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
        [CantFetchWebhookError: Adyen is down
        Error retrieving webhook]
      `);
    });
  });

  describe("updateWebhookDescription", () => {
    it("Updates the endpoint description from the configuration name", async () => {
      vi.mocked(adyenSdkMock.webhookEndpoints.update).mockResolvedValueOnce({
        id: "we_123",
      } as unknown as Adyen.Response<Adyen.WebhookEndpoint>);

      const result = await instance.updateWebhookDescription({
        webhookId: "we_123",
        restrictedKey: mockedAdyenRestrictedKey,
        configName: "UK Live",
      });

      expect(result.isOk()).toBe(true);
      expect(adyenSdkMock.webhookEndpoints.update).toHaveBeenCalledWith("we_123", {
        description: "Created by Saleor App Payment Adyen, config name: UK Live",
      });
    });

    it("Returns CantUpdateWebhookError when Adyen rejects the update", async () => {
      vi.mocked(adyenSdkMock.webhookEndpoints.update).mockRejectedValueOnce(
        new Error("Test error"),
      );

      const result = await instance.updateWebhookDescription({
        webhookId: "we_123",
        restrictedKey: mockedAdyenRestrictedKey,
        configName: "UK Live",
      });

      expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
        [CantUpdateWebhookError: Test error
        Error updating webhook]
      `);
    });
  });

  describe("error cases", () => {
    it("Returns CantCreateWebhookUrlError if base app url is broken", async () => {
      vi.mocked(adyenSdkMock.webhookEndpoints.create).mockImplementationOnce(
        async () =>
          ({
            secret: mockAdyenWebhookSecret,
            id: "test-id",
          }) as unknown as Adyen.Response<Adyen.WebhookEndpoint>,
      );

      const result = await instance.createWebhook(
        {
          configurationId: mockedConfigurationId,
          name: "config name",
          publishableKey: mockedAdyenPublishableKey,
          restrictedKey: mockedAdyenRestrictedKey,
        },
        {
          appUrl: "not url",
          saleorApiUrl: mockedSaleorApiUrl,
          appId: mockedSaleorAppId,
        },
      );

      expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(
        `[CantCreateWebhookUrlError: Cant create URL]`,
      );
    });

    it("Returns InvalidDataError if Adyen secret was not returned", async () => {
      vi.mocked(adyenSdkMock.webhookEndpoints.create).mockImplementationOnce(
        async () =>
          ({
            // Secret missing here
            id: "test-id",
          }) as unknown as Adyen.Response<Adyen.WebhookEndpoint>,
      );

      const result = await instance.createWebhook(
        {
          configurationId: mockedConfigurationId,
          name: "config name",
          publishableKey: mockedAdyenPublishableKey,
          restrictedKey: mockedAdyenRestrictedKey,
        },
        {
          appUrl: "http://localhost:3000",
          saleorApiUrl: mockedSaleorApiUrl,
          appId: mockedSaleorAppId,
        },
      );

      expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(
        `[CantCreateWebhookError: Result from Adyen was unexpected]`,
      );
    });

    it("Returns CantCreateWebhookError if Adyen SDK returns any error", async () => {
      vi.mocked(adyenSdkMock.webhookEndpoints.create).mockImplementationOnce(async () => {
        throw new Error("Test error");
      });

      const result = await instance.createWebhook(
        {
          configurationId: mockedConfigurationId,
          name: "config name",
          publishableKey: mockedAdyenPublishableKey,
          restrictedKey: mockedAdyenRestrictedKey,
        },
        {
          appUrl: "http://localhost:3000",
          saleorApiUrl: mockedSaleorApiUrl,
          appId: mockedSaleorAppId,
        },
      );

      expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
        [CantCreateWebhookError: Test error
        Error creating webhook]
      `);
    });

    it("Returns CantRemoveWebhookError if Adyen SDK returns any error", async () => {
      vi.mocked(adyenSdkMock.webhookEndpoints.del).mockImplementationOnce(async () => {
        return Promise.reject(new Error("Test error"));
      });

      const result = await instance.removeWebhook({
        webhookId: "we_123",
        restrictedKey: mockedAdyenRestrictedKey,
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toMatchInlineSnapshot(`
        [CantRemoveWebhookError: Test error
        Error removing webhook]
      `);
    });
  });

  it("Calls adyen client to create endpoints with valid arguments, returns created ID and secret", async () => {
    vi.mocked(adyenSdkMock.webhookEndpoints.create).mockImplementationOnce(
      async () =>
        ({
          secret: mockAdyenWebhookSecret,
          id: "test-id",
        }) as unknown as Adyen.Response<Adyen.WebhookEndpoint>,
    );

    const result = await instance.createWebhook(
      {
        configurationId: mockedConfigurationId,
        name: "config name",
        publishableKey: mockedAdyenPublishableKey,
        restrictedKey: mockedAdyenRestrictedKey,
      },
      {
        appUrl: "http://localhost:3000",
        saleorApiUrl: mockedSaleorApiUrl,
        appId: mockedSaleorAppId,
      },
    );

    expect(result._unsafeUnwrap()).toStrictEqual({
      id: "test-id",
      secret: mockAdyenWebhookSecret,
    });

    /**
     * Ensure we send proper webhook params to Adyen
     */
    expect(vi.mocked(adyenSdkMock.webhookEndpoints.create).mock.calls[0][0])
      .toMatchInlineSnapshot(`
        {
          "api_version": "2025-04-30.basil",
          "description": "Created by Saleor App Payment Adyen, config name: config name",
          "enabled_events": [
            "payment_intent.amount_capturable_updated",
            "payment_intent.payment_failed",
            "payment_intent.processing",
            "payment_intent.requires_action",
            "payment_intent.succeeded",
            "payment_intent.canceled",
            "charge.refund.updated",
          ],
          "metadata": {
            "saleorAppConfigurationId": "81f323bd-91e2-4838-ab6e-5affd81ffc3b",
          },
          "url": "http://localhost:3000/api/webhooks/adyen?configurationId=81f323bd-91e2-4838-ab6e-5affd81ffc3b&saleorApiUrl=https%3A%2F%2Ffoo.bar.saleor.cloud%2Fgraphql%2F&appId=saleor-app-id",
        }
      `);
  });

  it("Calls adyen client to remove endpoint based on it's ID", async () => {
    vi.mocked(adyenSdkMock.webhookEndpoints.del).mockImplementationOnce(async () => {
      return {
        id: "we_123",
        object: "webhook_endpoint",
        deleted: true,
        lastResponse: {} as never,
      };
    });

    const result = await instance.removeWebhook({
      webhookId: "we_123",
      restrictedKey: mockedAdyenRestrictedKey,
    });

    expect(result.isOk()).toBe(true);
    expect(adyenSdkMock.webhookEndpoints.del).toHaveBeenCalledWith("we_123");
  });
});
