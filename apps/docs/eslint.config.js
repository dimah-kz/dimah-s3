import { nextJsConfig } from "@workspace/eslint-config/next-js";

/** @type {import("eslint").Linter.Config} */
export default [
  ...nextJsConfig,
  {
    ignores: [".source/**", "out/**", "build/**", "next-env.d.ts"],
  },
];
