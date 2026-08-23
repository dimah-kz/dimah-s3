import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    name: "server",
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
