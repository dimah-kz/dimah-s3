import { packageConfig } from "@workspace/vitest-config";

export default packageConfig(import.meta.dirname, {
  name: "ui",
  environment: "jsdom",
  include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  pool: "threads",
});
