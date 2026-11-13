import { err, ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockedAppConfigRepo } from "@/__tests__/mocks/app-config-repo";
import {
  mockedAppToken,
  mockedConfigurationId,
  mockedSaleorAppId,
} from "@/__tests__/mocks/constants";
import { mockedGraphqlClient } from "@/__tests__/mocks/graphql-client";
import { mockedAdyenConfig } from "@/__tests__/mocks/mock-adyen-config";
import {
  mockedAdyenPublishableKey,
  mockedAdyenPublishableKeyTest,
} from "@/__tests__/mocks/mocked-adyen-publishable-key";
import {
  mockedAdyenRestrictedKey,
  mockedAdyenRestrictedKeyTest,
} from "@/__tests__/mocks/mocked-adyen-restricted-key";
import { mockedSaleorApiUrl } from "@/__tests__/mocks/saleor-api-url";
import { mockAdyenWebhookSecret } from "@/__tests__/mocks/adyen-webhook-secret";
import { TEST_Procedure } from "@/__tests__/trpc-testing-procedure";
import { BaseError } from "@/lib/errors";
import { AppRootConfig } from "@/modules/app-config/domain/app-root-config";
import { UpdateAdyenConfigTrpcHandler } from "@/modules/app-config/trpc-handlers/update-adyen-config-trpc-handler";
import { AdyenAuthValidator } from "@/modules/adyen/adyen-auth-validator";
import {
  AdyenWebhookManager,
  AdyenWebhookManagerErrors,
} from "@/modules/adyen/adyen-webhook-manager";
import { router } from "@/modules/trpc/trpc-server";

vi.mock("next/server", () => ({
  after: (callback: () => unknown) => callback(),
}));

vi.mock("@/lib/graphql-client", () => ({
  createInstrumentedGraphqlClient: () => ({}),
}));

const clearProblemsForConfig = vi.hoisted(() => vi.fn());

vi.mock("@/modules/app-problems/adyen-problem-reporter", () => ({
  AdyenProblemReporter: class {
    clearProblemsForConfig = clearProblemsForConfig;
  },
}));

const getTestCaller = () => {
  const webhookManager = new AdyenWebhookManager();
  const instance = new UpdateAdyenConfigTrpcHandler({ webhookManager });

  // @ts-expect-error - context doesnt match but its applied in test
  instance.baseProcedure = TEST_Procedure;

  const testRouter = router({
    testProcedure: instance.getTrpcProcedure(),
  });

  return {
    webhookManager,
    mockedAppConfigRepo,
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

const validInput = {
  configId: mockedConfigurationId,
  name: "Renamed config",
  publishableKey: mockedAdyenPublishableKey,
  restrictedKey: null,
};

const mockExistingConfig = () => {
  vi.mocked(mockedAppConfigRepo.getRootConfig).mockResolvedValue(
    ok(new AppRootConfig({}, { [mockedConfigurationId]: mockedAdyenConfig })),
  );
  vi.mocked(mockedAppConfigRepo.saveAdyenConfig).mockResolvedValue(ok(null));
};

describe("UpdateAdyenConfigTrpcHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockExistingConfig();
  });

  it("Returns 404 when config does not exist", async () => {
    const { caller } = getTestCaller();

    vi.mocked(mockedAppConfigRepo.getRootConfig).mockResolvedValue(ok(new AppRootConfig({}, {})));

    return expect(() =>
      caller.testProcedure(validInput),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[TRPCError: Config not found, please refresh the page and try again.]`,
    );
  });

  describe("renaming only", () => {
    it("Saves the new name, keeping keys and webhook untouched", async () => {
      const { caller, webhookManager } = getTestCaller();
      const createWebhook = vi.spyOn(webhookManager, "createWebhook");
      const updateDescription = vi
        .spyOn(webhookManager, "updateWebhookDescription")
        .mockResolvedValue(ok(null));

      await caller.testProcedure(validInput);

      const savedConfig = vi.mocked(mockedAppConfigRepo.saveAdyenConfig).mock.calls[0][0].config;

      expect(savedConfig.name).toBe("Renamed config");
      expect(savedConfig.id).toBe(mockedConfigurationId);
      expect(savedConfig.restrictedKey).toBe(mockedAdyenRestrictedKey);
      expect(savedConfig.webhookId).toBe(mockedAdyenConfig.webhookId);
      expect(savedConfig.webhookSecret).toBe(mockedAdyenConfig.webhookSecret);
      expect(createWebhook).not.toHaveBeenCalled();
      expect(updateDescription).toHaveBeenCalledWith({
        webhookId: mockedAdyenConfig.webhookId,
        restrictedKey: mockedAdyenRestrictedKey,
        configName: "Renamed config",
      });
      expect(clearProblemsForConfig).not.toHaveBeenCalled();
    });

    it("Returns 500 when config cannot be saved", async () => {
      const { caller } = getTestCaller();

      vi.mocked(mockedAppConfigRepo.saveAdyenConfig).mockResolvedValue(err(new BaseError("TEST")));

      return expect(() =>
        caller.testProcedure(validInput),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[TRPCError: Failed to update Adyen configuration. Data can't be saved.]`,
      );
    });
  });

  describe("rotating the restricted key", () => {
    const rotatedKey = "rk_live_rotated";

    it("Keeps the existing webhook when the new key can reach it", async () => {
      const { caller, webhookManager } = getTestCaller();

      vi.spyOn(AdyenAuthValidator.prototype, "validateAdyenAuth").mockResolvedValue(ok(null));

      const isReachable = vi
        .spyOn(webhookManager, "isWebhookReachableWithKey")
        .mockResolvedValue(ok(true));
      const createWebhook = vi.spyOn(webhookManager, "createWebhook");
      const removeWebhook = vi.spyOn(webhookManager, "removeWebhook");

      await caller.testProcedure({ ...validInput, name: "config-name", restrictedKey: rotatedKey });

      const savedConfig = vi.mocked(mockedAppConfigRepo.saveAdyenConfig).mock.calls[0][0].config;

      expect(isReachable).toHaveBeenCalledWith({
        webhookId: mockedAdyenConfig.webhookId,
        restrictedKey: rotatedKey,
      });
      expect(savedConfig.restrictedKey).toBe(rotatedKey);
      expect(savedConfig.webhookId).toBe(mockedAdyenConfig.webhookId);
      expect(createWebhook).not.toHaveBeenCalled();
      expect(removeWebhook).not.toHaveBeenCalled();
      expect(clearProblemsForConfig).toHaveBeenCalledWith(mockedConfigurationId);
    });

    it("Recreates the webhook when the key points to another Adyen account", async () => {
      const { caller, webhookManager } = getTestCaller();

      vi.spyOn(AdyenAuthValidator.prototype, "validateAdyenAuth").mockResolvedValue(ok(null));
      vi.spyOn(webhookManager, "isWebhookReachableWithKey").mockResolvedValue(ok(false));

      const createWebhook = vi.spyOn(webhookManager, "createWebhook").mockResolvedValue(
        ok({
          id: "wh_new",
          secret: mockAdyenWebhookSecret,
        }),
      );
      const removeWebhook = vi.spyOn(webhookManager, "removeWebhook").mockResolvedValue(ok(null));

      await caller.testProcedure({ ...validInput, name: "config-name", restrictedKey: rotatedKey });

      const savedConfig = vi.mocked(mockedAppConfigRepo.saveAdyenConfig).mock.calls[0][0].config;

      expect(createWebhook).toHaveBeenCalledOnce();
      expect(savedConfig.webhookId).toBe("wh_new");
      expect(savedConfig.webhookSecret).toBe(mockAdyenWebhookSecret);
      expect(removeWebhook).toHaveBeenCalledWith({
        webhookId: mockedAdyenConfig.webhookId,
        restrictedKey: mockedAdyenRestrictedKey,
      });
    });

    it("Does not touch the config when the new restricted key is invalid", async () => {
      const { caller } = getTestCaller();

      vi.spyOn(AdyenAuthValidator.prototype, "validateAdyenAuth").mockResolvedValue(
        err(new AdyenAuthValidator.AuthError("TEST")),
      );

      await expect(() =>
        caller.testProcedure({ ...validInput, restrictedKey: rotatedKey }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[TRPCError: Failed to update Adyen configuration. Restricted key is invalid]`,
      );

      expect(mockedAppConfigRepo.saveAdyenConfig).not.toHaveBeenCalled();
    });

    it("Aborts instead of risking a duplicate webhook when Adyen cannot be reached", async () => {
      const { caller, webhookManager } = getTestCaller();

      vi.spyOn(AdyenAuthValidator.prototype, "validateAdyenAuth").mockResolvedValue(ok(null));
      vi.spyOn(webhookManager, "isWebhookReachableWithKey").mockResolvedValue(
        err(new AdyenWebhookManagerErrors.CantFetchWebhookError("Adyen is down")),
      );

      const createWebhook = vi.spyOn(webhookManager, "createWebhook");

      await expect(() =>
        caller.testProcedure({ ...validInput, restrictedKey: rotatedKey }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[TRPCError: Couldn't verify the existing Adyen webhook with the new key. Ensure the key can read and write webhook endpoints, then try again.]`,
      );

      expect(createWebhook).not.toHaveBeenCalled();
      expect(mockedAppConfigRepo.saveAdyenConfig).not.toHaveBeenCalled();
    });
  });

  describe("switching environment", () => {
    it("Rejects a publishable key from another environment while the stored key is kept", async () => {
      const { caller } = getTestCaller();

      await expect(() =>
        caller.testProcedure({
          ...validInput,
          publishableKey: mockedAdyenPublishableKeyTest,
          restrictedKey: null,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[TRPCError: Publishable key belongs to a different environment than the saved restricted key. To switch between sandbox and live, provide both keys.]`,
      );

      expect(mockedAppConfigRepo.saveAdyenConfig).not.toHaveBeenCalled();
    });

    it("Rejects mixed environments in the submitted pair", async () => {
      const { caller } = getTestCaller();

      await expect(() =>
        caller.testProcedure({
          ...validInput,
          publishableKey: mockedAdyenPublishableKeyTest,
          restrictedKey: mockedAdyenRestrictedKey,
        }),
      ).rejects.toThrow(/Both Publishable and Restricted Keys must be live or test/);
    });

    it("Accepts a matching pair from the other environment and recreates the webhook", async () => {
      const { caller, webhookManager } = getTestCaller();

      vi.spyOn(AdyenAuthValidator.prototype, "validateAdyenAuth").mockResolvedValue(ok(null));
      vi.spyOn(webhookManager, "isWebhookReachableWithKey").mockResolvedValue(ok(false));
      vi.spyOn(webhookManager, "createWebhook").mockResolvedValue(
        ok({ id: "wh_test_new", secret: mockAdyenWebhookSecret }),
      );
      vi.spyOn(webhookManager, "removeWebhook").mockResolvedValue(ok(null));

      await caller.testProcedure({
        ...validInput,
        name: "config-name",
        publishableKey: mockedAdyenPublishableKeyTest,
        restrictedKey: mockedAdyenRestrictedKeyTest,
      });

      const savedConfig = vi.mocked(mockedAppConfigRepo.saveAdyenConfig).mock.calls[0][0].config;

      expect(savedConfig.getAdyenEnvValue()).toBe("TEST");
      expect(savedConfig.webhookId).toBe("wh_test_new");
    });
  });
});
