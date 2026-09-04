import { join } from "node:path";
import { defineConfig } from "vitest/config";

const defaults = {
  // Vitest 5 default; set explicitly so package tests can drop per-file mockClear.
  clearMocks: true,
  restoreMocks: true,
  fsModuleCache: true,
  environment: "node" as const,
  include: ["src/**/*.test.ts"],
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
