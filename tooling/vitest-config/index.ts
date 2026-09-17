import { join } from "node:path";
import { defineConfig } from "vitest/config";

const defaults = {
  // Isolate each test file's mocks, spies, and stubbed env/globals.
  clearMocks: true,
  restoreMocks: true,
  mockReset: true,
  unstubEnvs: true,
  unstubGlobals: true,
  isolate: true,
  fsModuleCache: true,
  environment: "node" as const,
  include: ["src/**/*.{test,spec}.{ts,tsx}"],
  chaiConfig: {
    truncateThreshold: 80,
  },
};

export function packageConfig(
  dirname: string,
  test: {
    name: string;
    environment?: "node" | "jsdom";
    include?: string[];
    unstubGlobals?: boolean;
    pool?: "forks" | "threads" | "vmForks" | "vmThreads";
    setupFiles?: string | string[];
  },
) {
  return defineConfig({
    resolve: {
      alias: { "@": join(dirname, "src") },
    },
    test: {
      ...defaults,
      ...test,
    },
  });
}
