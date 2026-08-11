import { config } from "@workspace/eslint-config/react";

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  {
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
];
