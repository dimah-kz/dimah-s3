// @ts-check

import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import turboPlugin from "eslint-plugin-turbo";
import globals from "globals";
import tseslint from "typescript-eslint";

import { errorifyRules } from "./errorify.js";
import { ignorePatterns } from "./ignores.js";

const turboRecommended = turboPlugin.configs["flat/recommended"];

/** Shared rules without Prettier — compose into React/Next, then append Prettier last. */
export const baseConfig = defineConfig(
  globalIgnores(ignorePatterns),
  {
    name: "workspace/linter-options",
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    ...turboRecommended,
    name: "workspace/turbo",
    rules: errorifyRules(turboRecommended.rules),
  },
  {
    name: "workspace/typescript-overrides",
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    name: "workspace/node-scripts",
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    ...vitest.configs.recommended,
    name: "workspace/vitest",
    files: ["**/*.{test,spec}.{js,jsx,mjs,cjs,ts,tsx}"],
    rules: {
      ...errorifyRules(vitest.configs.recommended.rules),
      "vitest/expect-expect": [
        "error",
        {
          assertFunctionNames: [
            "expect",
            "expectCode",
            "expectErrorCode",
            "expectValidation",
          ],
        },
      ],
    },
  },
);

/** Shared config for Node/TS packages. Prettier last so it disables formatting rules. */
export const config = defineConfig(baseConfig, eslintConfigPrettier);
