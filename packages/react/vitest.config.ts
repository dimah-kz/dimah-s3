import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    name: "react",
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
