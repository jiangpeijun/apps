import { err, ok } from "neverthrow";
import Adyen from "adyen";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockedAppConfigRepo } from "@/__tests__/mocks/app-config-repo";
import { mockedAppToken, mockedSaleorAppId } from "@/__tests__/mocks/constants";
import { mockedGraphqlClient } from "@/__tests__/mocks/graphql-client";
import { mockedAdyenPublishableKey } from "@/__tests__/mocks/mocked-adyen-publishable-key";
import { mockedAdyenRestrictedKey } from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { mockAdyenWebhookSecret } from "@/__tests__/mocks/adyen-webhook-secret";
import { TEST_Procedure } from "@/__tests__/trpc-testing-procedure";
import { BaseError } from "@/lib/errors";
import { NewAdyenConfigTrpcHandler } from "@/modules/app-config/trpc-handlers/new-adyen-config-trpc-handler";
import { AdyenClient } from "@/modules/adyen/adyen-client";
import { AdyenWebhookManager } from "@/modules/adyen/adyen-webhook-manager";
import { router } from "@/modules/trpc/trpc-server";

const webhookCreator = new AdyenWebhookManager();

/**
 * TODO: Probably create some test abstraction to bootstrap trpc handler for testing
 */
const getTestCaller = () => {
  const instance = new NewAdyenConfigTrpcHandler({
    webhookManager: webhookCreator,
  });

  // @ts-expect-error - context doesnt match but its applied in test
  instance.baseProcedure = TEST_Procedure;

  const testRouter = router({
    testProcedure: instance.getTrpcProcedure(),
  });

  return {
    mockedAppConfigRepo,
    webhookCreator,
    caller: testRouter.createCaller({
      appId: mockedSaleorAppId,
      saleorApiUrl: mockedSaleorApiUrl,
      token: mockedAppToken,
      configRepo: mockedAppConfigRepo,
      apiClient: mockedGraphqlClient,
      appUrl: "https://localhost:3000",
    }),
  };
};

describe("NewAdyenConfigTrpcHandler", () => {
  const adyen = new Adyen("key");

  beforeEach(() => {
    vi.resetAllMocks();

    vi.spyOn(adyen.paymentIntents, "list").mockImplementation(() => {
      return Promise.resolve({}) as Adyen.ApiListPromise<Adyen.PaymentIntent>;
    });
    vi.spyOn(AdyenClient, "createFromRestrictedKey").mockImplementation(() => {
      return {
        nativeClient: adyen,
      };
    });
    vi.spyOn(webhookCreator, "createWebhook").mockImplementation(async () =>
      ok({
        id: "whid_1234",
        secret: mockAdyenWebhookSecret,
      }),
    );
  });

  it("Returns error 500 if repository fails to save config", async () => {
    const { caller, mockedAppConfigRepo } = getTestCaller();

    vi.spyOn(mockedAppConfigRepo, "saveAdyenConfig").mockImplementationOnce(async () =>
      err(new BaseError("TEST")),
    );

    return expect(() =>
      caller.testProcedure({
        name: "Test config",
        publishableKey: mockedAdyenPublishableKey,
        restrictedKey: mockedAdyenRestrictedKey,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[TRPCError: Failed to create Adyen configuration. Data can't be saved.]`,
    );
  });

  it("Returns 404 if config is in invalid shape (model can't be created)", () => {
    const { caller, mockedAppConfigRepo } = getTestCaller();

    vi.spyOn(mockedAppConfigRepo, "saveAdyenConfig").mockImplementationOnce(async () => ok(null));

    // todo expect pretty zod error with zod-validation-error
    return expect(
      caller.testProcedure({
        name: "", //empty name should throw
        publishableKey: mockedAdyenPublishableKey,
        restrictedKey: mockedAdyenRestrictedKey,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      [TRPCError: [
        {
          "code": "too_small",
          "minimum": 1,
          "type": "string",
          "inclusive": true,
          "exact": false,
          "message": "String must contain at least 1 character(s)",
          "path": [
            "name"
          ]
        }
      ]]
    `);
  });

  it("Doesn't throw if everything set properly. Config repo is called to save data", async () => {
    const { caller, mockedAppConfigRepo } = getTestCaller();

    vi.spyOn(mockedAppConfigRepo, "saveAdyenConfig").mockImplementationOnce(async () => ok(null));

    await expect(
      caller.testProcedure({
        name: "Test config",
        publishableKey: mockedAdyenPublishableKey,
        restrictedKey: mockedAdyenRestrictedKey,
      }),
    ).resolves.not.toThrow();

    const mockCallArg = vi.mocked(mockedAppConfigRepo.saveAdyenConfig).mock.calls[0][0];

    expect(mockCallArg).toMatchInlineSnapshot(
      {
        config: {
          id: expect.any(String),
        },
      },
      `
      {
        "appId": "saleor-app-id",
        "config": {
          "id": Any<String>,
          "name": "Test config",
          "publishableKey": "pk_live_1",
          "restrictedKey": "rk_live_AAAAABBBBCCCCCEEEEEEEFFFFFGGGGG",
          "webhookId": "whid_1234",
          "webhookSecret": "whsec_XYZ",
        },
        "saleorApiUrl": "https://foo.bar.saleor.cloud/graphql/",
      }
    `,
    );
  });

  describe("Adyen Auth", () => {
    it("Calls auth service and returns error if Adyen RK is invalid", () => {
      // @ts-expect-error - mocking adyen client
      vi.spyOn(adyen.paymentIntents, "list").mockImplementationOnce(async () => {
        throw new Error("Invalid key");
      });

      const { caller } = getTestCaller();

      return expect(() =>
        caller.testProcedure({
          name: "Test config",
          publishableKey: mockedAdyenPublishableKey,
          restrictedKey: mockedAdyenRestrictedKey,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[TRPCError: Failed to create Adyen configuration. Restricted key is invalid]`,
      );

      expect(adyen.paymentIntents.list).toHaveBeenCalledOnce();
    });
  });
});
