import { packageConfig } from "@workspace/vitest-config";

export default packageConfig(import.meta.dirname, {
  name: "react",
  environment: "jsdom",
  include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  unstubGlobals: true,
  setupFiles: ["./src/test/setup.ts"],
  pool: "threads",
});
