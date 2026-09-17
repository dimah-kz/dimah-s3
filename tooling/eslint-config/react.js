// @ts-check

import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import jsxA11y from "eslint-plugin-jsx-a11y";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

import { baseConfig } from "./base.js";
import { errorifyRules } from "./errorify.js";

const reactFiles = ["**/*.{js,jsx,ts,tsx}"];
const reactRecommended = pluginReact.configs.flat.recommended;
const reactJsxRuntime = pluginReact.configs.flat["jsx-runtime"];
const reactHooksRecommended =
  pluginReactHooks.configs.flat["recommended-latest"];

/** React + hooks rules without Prettier — compose into Next, then append Prettier last. */
export const reactConfig = defineConfig(
  {
    ...reactRecommended,
    name: "workspace/react",
    files: reactFiles,
    languageOptions: {
      ...reactRecommended.languageOptions,
      globals: globals.browser,
    },
    settings: {
      // Pin the version: `detect` uses the legacy ESLint context API and
      // crashes on ESLint 10 (`context.getFilename is not a function`).
      react: { version: "19" },
    },
    rules: {
      ...errorifyRules(reactRecommended.rules),
      // TypeScript owns prop types.
      "react/prop-types": "off",
      "react/jsx-no-useless-fragment": ["error", { allowExpressions: true }],
      "react/no-unstable-nested-components": ["error", { allowAsProps: true }],
      "react/self-closing-comp": "error",
    },
  },
  {
    ...reactJsxRuntime,
    name: "workspace/react-jsx-runtime",
    files: reactFiles,
  },
  {
    ...reactHooksRecommended,
    name: "workspace/react-hooks",
    files: reactFiles,
    rules: errorifyRules(reactHooksRecommended.rules),
  },
  {
    ...jsxA11y.flatConfigs.recommended,
    name: "workspace/jsx-a11y",
    files: reactFiles,
    rules: errorifyRules(jsxA11y.flatConfigs.recommended.rules),
  },
  {
    name: "workspace/shadcn-primitives",
    files: ["**/components/ui/**/*.{ts,tsx}"],
    rules: {
      // shadcn primitives: association happens at the call site.
      "jsx-a11y/label-has-associated-control": "off",
    },
  },
);

export const config = defineConfig(
  baseConfig,
  reactConfig,
  eslintConfigPrettier,
);
