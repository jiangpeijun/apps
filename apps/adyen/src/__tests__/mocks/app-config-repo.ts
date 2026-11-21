import { vi } from "vitest";

export const mockAppConfigRepo = {
  getAppConfig: vi.fn(),
  setAppConfig: vi.fn(),
};

export const createMockAppConfigRepo = () => mockAppConfigRepo;
