// apps/adyen/src/modules/app-problems/adyen-problem-reporter.ts
import { AppProblemsReporter } from "@saleor/app-problems";
import { type Client } from "urql";

import { createLogger } from "@/lib/logger";
import { type AdyenApiError } from "@/modules/adyen/adyen-api-error";

const logger = createLogger("AdyenProblemReporter");

export const PROBLEM_KEYS = {
  apiFailure: (configId: string) => `adyen-api-failure:${configId}`,
  configMissing: (configId: string) => `adyen-config-missing:${configId}`,
} as const;

export class AdyenProblemReporter {
  private reporter: AppProblemsReporter;

  constructor(client: Client) {
    this.reporter = new AppProblemsReporter(client);
  }

  async reportApiProblem(
    error: AdyenApiError,
    config: { id: string; name: string },
  ): Promise<void> {
    const result = await this.reporter.reportProblem({
      key: PROBLEM_KEYS.apiFailure(config.id),
      criticalThreshold: 1,
      message: `Adyen API error for configuration "${config.name}": ${error.message}. Please verify your Adyen credentials.`,
    });

    if (result.isErr()) {
      logger.warn("Failed to report API problem", { error: result.error });
    }
  }

  async clearProblemsForConfig(configId: string): Promise<void> {
    const keys = [
      PROBLEM_KEYS.apiFailure(configId),
      PROBLEM_KEYS.configMissing(configId),
    ];
    const result = await this.reporter.clearProblems(keys);

    if (result.isErr()) {
      logger.warn("Failed to clear problems for config", { error: result.error, configId });
    }
  }
}