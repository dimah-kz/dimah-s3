// @ts-check

import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import importX from "eslint-plugin-import-x";
import regexp from "eslint-plugin-regexp";
import turboPlugin from "eslint-plugin-turbo";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

import { errorifyRules } from "./errorify.js";
import { ignorePatterns } from "./ignores.js";

const turboRecommended = turboPlugin.configs["flat/recommended"];
const regexpRecommended = regexp.configs["flat/recommended"];

/** Shared rules without Prettier — compose into React/Next, then append Prettier last. */
export const baseConfig = defineConfig(
  globalIgnores(ignorePatterns),
  {
    name: "workspace/linter-options",
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error",
    },
  },
  js.configs.recommended,
  tseslint.configs.strict,
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
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-dynamic-delete": "off",
      // Dual sync/async adapter APIs (`void | Promise<void>`).
      "@typescript-eslint/no-invalid-void-type": "off",
    },
  },
  {
    name: "workspace/typescript-type-checked",
    files: ["**/*.{ts,tsx,mts}"],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "*.mjs",
            "*.js",
            "eslint.config.js",
            "tsup.config.ts",
            "vitest.config.ts",
            "scripts/*.ts",
          ],
        },
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-for-in-array": "error",
      "@typescript-eslint/no-implied-eval": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      "@typescript-eslint/consistent-type-exports": [
        "error",
        { fixMixedExportsWithInlineTypeSpecifier: true },
      ],
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],
      "@typescript-eslint/no-meaningless-void-operator": "error",
      "@typescript-eslint/no-unnecessary-boolean-literal-compare": "error",
      "@typescript-eslint/no-unnecessary-template-expression": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",
      "@typescript-eslint/related-getter-setter-pairs": "error",
      "@typescript-eslint/restrict-plus-operands": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
    },
  },
  {
    ...turboRecommended,
    name: "workspace/turbo",
    rules: errorifyRules(turboRecommended.rules),
  },
  {
    name: "workspace/import-x",
    plugins: {
      "import-x": importX,
    },
    rules: {
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-duplicates": "error",
      "import-x/no-empty-named-blocks": "error",
      "import-x/no-self-import": "error",
      "import-x/no-useless-path-segments": "error",
    },
  },
  {
    name: "workspace/unicorn",
    plugins: {
      unicorn,
    },
    rules: {
      "unicorn/error-message": "error",
      "unicorn/no-await-in-promise-methods": "error",
      "unicorn/no-new-buffer": "error",
      "unicorn/no-single-promise-in-promise-methods": "error",
      "unicorn/no-unnecessary-await": "error",
      "unicorn/no-useless-fallback-in-spread": "error",
      "unicorn/no-useless-promise-resolve-reject": "error",
      "unicorn/no-useless-spread": "error",
      "unicorn/prefer-array-find": "error",
      "unicorn/prefer-array-flat": "error",
      "unicorn/prefer-array-flat-map": "error",
      "unicorn/prefer-array-some": "error",
      "unicorn/prefer-date-now": "error",
      "unicorn/prefer-includes": "error",
      "unicorn/prefer-node-protocol": "error",
      "unicorn/prefer-number-properties": "error",
      "unicorn/prefer-optional-catch-binding": "error",
      "unicorn/prefer-regexp-test": "error",
      "unicorn/prefer-string-replace-all": "error",
      "unicorn/prefer-string-slice": "error",
      "unicorn/prefer-structured-clone": "error",
      "unicorn/prefer-type-error": "error",
      "unicorn/throw-new-error": "error",
    },
  },
  {
    ...regexpRecommended,
    name: "workspace/regexp",
    rules: errorifyRules(regexpRecommended.rules),
  },
  {
    name: "workspace/javascript-quality",
    rules: {
      curly: ["error", "multi-line", "consistent"],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "object-shorthand": ["error", "always"],
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
      "vitest/consistent-test-it": ["error", { fn: "it" }],
      "vitest/no-alias-methods": "error",
      "vitest/no-commented-out-tests": "error",
      "vitest/prefer-hooks-in-order": "error",
      "vitest/prefer-hooks-on-top": "error",
      "vitest/prefer-mock-promise-shorthand": "error",
      "vitest/prefer-spy-on": "error",
      "vitest/prefer-to-be": "error",
      "vitest/prefer-to-contain": "error",
      "vitest/prefer-to-have-length": "error",
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
