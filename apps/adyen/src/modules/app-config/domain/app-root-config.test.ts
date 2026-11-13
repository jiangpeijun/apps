import { describe, expect, it } from "vitest";

import { mockedConfigurationId } from "@/__tests__/mocks/constants";
import { mockedAdyenConfig } from "@/__tests__/mocks/mock-adyen-config";
import { AppRootConfig } from "@/modules/app-config/domain/app-root-config";
import { AdyenConfig } from "@/modules/app-config/domain/adyen-config";

describe("AppRootConfig", () => {
  describe("getAllConfigsAsList", () => {
    it("Returns stored configs as list", () => {
      const appRootConfig = new AppRootConfig(
        {
          "channel-1": "config-1",
        },
        {
          [mockedAdyenConfig.id]: mockedAdyenConfig,
          "config-2": AdyenConfig.create({
            name: "c2",
            webhookId: mockedAdyenConfig.webhookId,
            webhookSecret: mockedAdyenConfig.webhookSecret,
            publishableKey: mockedAdyenConfig.publishableKey,
            restrictedKey: mockedAdyenConfig.restrictedKey,
            id: "config-2",
          })._unsafeUnwrap(),
        },
      );

      expect(appRootConfig.getAllConfigsAsList()).toMatchInlineSnapshot(`
        [
          AdyenConfig {
            "id": "81f323bd-91e2-4838-ab6e-5affd81ffc3b",
            "name": "config-name",
            "publishableKey": "pk_live_1",
            "restrictedKey": "rk_live_AAAAABBBBCCCCCEEEEEEEFFFFFGGGGG",
            "webhookId": "wh_123456789",
            "webhookSecret": "whsec_XYZ",
          },
          AdyenConfig {
            "id": "config-2",
            "name": "c2",
            "publishableKey": "pk_live_1",
            "restrictedKey": "rk_live_AAAAABBBBCCCCCEEEEEEEFFFFFGGGGG",
            "webhookId": "wh_123456789",
            "webhookSecret": "whsec_XYZ",
          },
        ]
      `);
    });
  });

  describe("getChannelsBoundToGivenConfig", () => {
    it("Returns empty list if no mapping found", () => {
      const rootConfig = new AppRootConfig({}, {});

      expect(rootConfig.getChannelsBoundToGivenConfig(mockedConfigurationId)).toStrictEqual([]);
    });

    it("Returns list of channels IDs if they are mapped to given config ID", () => {
      const rootConfig = new AppRootConfig(
        {
          "channel-1": mockedConfigurationId,
          "channel-2": mockedConfigurationId,
          "channel-3": "another-config-id",
        },
        {},
      );

      expect(rootConfig.getChannelsBoundToGivenConfig(mockedConfigurationId)).toStrictEqual([
        "channel-1",
        "channel-2",
      ]);
    });
  });
});
