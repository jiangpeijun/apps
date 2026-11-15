// apps\adyen\src\modules\app-config\repositories\app-config-repo.ts
import { type Result } from "neverthrow";

import { BaseError } from "@/lib/errors";
import { type AppRootConfig } from "@/modules/app-config/domain/app-root-config";
import { type SaleorApiUrl } from "@/modules/saleor/saleor-api-url";

import { type AdyenConfig } from "../domain/adyen-config";

export type BaseAccessPattern = {
  saleorApiUrl: SaleorApiUrl;
  appId: string;
};

/**
 * Adyen webhook will provide ID of config from URL. Repo must be able to access it
 */
export type AdyenConfigByChannelIdAccessPattern = BaseAccessPattern & {
  channelId: string;
};

/**
 * Saleor webhook will have available channel as access pattern. Repo must store channel<->config relation for this case
 */
export type AdyenConfigByConfigIdAccessPattern = BaseAccessPattern & {
  configId: string;
};

export type GetAdyenConfigAccessPattern =
  | AdyenConfigByChannelIdAccessPattern
  | AdyenConfigByConfigIdAccessPattern;

export const AppConfigRepoError = {
  FailureSavingConfig: BaseError.subclass("FailureSavingConfigError", {
    props: {
      _internalName: "AppConfigRepoError.FailureSavingConfigError",
    },
  }),
  FailureFetchingConfig: BaseError.subclass("FailureFetchingConfigError", {
    props: {
      _internalName: "AppConfigRepoError.FailureFetchingConfigError",
    },
  }),
  FailureRemovingConfig: BaseError.subclass("FailureRemovingConfigError", {
    props: {
      _internalName: "AppConfigRepoError.FailureRemovingConfig",
    },
  }),
};

export interface AppConfigRepo {
  saveAdyenConfig: (args: {
    config: AdyenConfig;
    saleorApiUrl: SaleorApiUrl;
    appId: string;
  }) => Promise<Result<null | void, InstanceType<typeof AppConfigRepoError.FailureSavingConfig>>>;
  getAdyenConfig: (
    access: GetAdyenConfigAccessPattern,
  ) => Promise<
    Result<AdyenConfig | null, InstanceType<typeof AppConfigRepoError.FailureFetchingConfig>>
  >;
  getRootConfig: (
    access: BaseAccessPattern,
  ) => Promise<
    Result<AppRootConfig, InstanceType<typeof AppConfigRepoError.FailureFetchingConfig>>
  >;
  removeConfig: (
    access: BaseAccessPattern,
    data: {
      configId: string;
    },
  ) => Promise<Result<null, InstanceType<typeof AppConfigRepoError.FailureRemovingConfig>>>;
  updateMapping: (
    access: BaseAccessPattern,
    data: {
      configId: string | null;
      channelId: string;
    },
  ) => Promise<Result<void | null, InstanceType<typeof AppConfigRepoError.FailureSavingConfig>>>;
}
