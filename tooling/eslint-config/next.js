// @ts-check

import pluginNext from "@next/eslint-plugin-next";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier/flat";

import { baseConfig } from "./base.js";
import { errorifyRules } from "./errorify.js";
import { reactConfig } from "./react.js";

const nextVitals = pluginNext.configs["core-web-vitals"];

export const nextJsConfig = defineConfig(
  baseConfig,
  reactConfig,
  {
    ...nextVitals,
    name: "workspace/next",
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: errorifyRules(nextVitals.rules),
  },
  eslintConfigPrettier,
);
