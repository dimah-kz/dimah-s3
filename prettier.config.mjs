/** @type {import("prettier").Config} */
const tailwindFunctions = ["cn", "cva", "clsx"];

/** @type {import("prettier").Config} */
const config = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  tabWidth: 2,
  printWidth: 80,
  endOfLine: "lf",
  arrowParens: "always",
  bracketSameLine: false,
  plugins: ["prettier-plugin-packagejson", "prettier-plugin-tailwindcss"],
  overrides: [
    {
      files: ["**/*.md"],
      options: { proseWrap: "preserve" },
    },
    {
      files: ["**/*.{yml,yaml}"],
      options: { singleQuote: false },
    },
    {
      files: ["apps/docs/**/*.{js,jsx,ts,tsx,css}"],
      excludeFiles: ["**/src/components/ui/**"],
      options: {
        tailwindFunctions,
        tailwindStylesheet: "./apps/docs/src/app/global.css",
      },
    },
    {
      files: ["apps/brand/**/*.{js,jsx,ts,tsx,css}"],
      excludeFiles: ["**/src/components/ui/**"],
      options: {
        tailwindFunctions,
        tailwindStylesheet: "./apps/brand/src/app/globals.css",
      },
    },
    {
      files: ["packages/ui/**/*.{js,jsx,ts,tsx,css}"],
      excludeFiles: ["**/src/components/ui/**"],
      options: {
        tailwindFunctions,
        tailwindStylesheet: "./apps/docs/src/app/global.css",
      },
    },
    {
      files: ["examples/with-nextjs/**/*.{js,jsx,ts,tsx,css}"],
      excludeFiles: ["**/src/components/ui/**"],
      options: {
        tailwindFunctions,
        tailwindStylesheet: "./examples/with-nextjs/src/app/globals.css",
      },
    },
    {
      files: ["examples/with-db/**/*.{js,jsx,ts,tsx,css}"],
      excludeFiles: ["**/src/components/ui/**"],
      options: {
        tailwindFunctions,
        tailwindStylesheet: "./examples/with-db/src/app/globals.css",
      },
    },
    {
      files: ["templates/nextjs/**/*.{js,jsx,ts,tsx,css}"],
      excludeFiles: ["**/src/components/ui/**"],
      options: {
        tailwindFunctions,
        tailwindStylesheet: "./templates/nextjs/src/app/globals.css",
      },
    },
    {
      files: ["templates/vite/**/*.{js,jsx,ts,tsx,css}"],
      excludeFiles: ["**/src/components/ui/**"],
      options: {
        tailwindFunctions,
        tailwindStylesheet: "./templates/vite/src/index.css",
      },
    },
    {
      files: ["templates/hono/**/*.{js,jsx,ts,tsx,css}"],
      excludeFiles: ["**/src/components/ui/**"],
      options: {
        tailwindFunctions,
        tailwindStylesheet: "./templates/hono/src/index.css",
      },
    },
    {
      // Stock shadcn primitives are generated — keep class strings as synced.
      files: ["**/src/components/ui/**/*.{ts,tsx}"],
      options: { plugins: ["prettier-plugin-packagejson"] },
    },
  ],
};

export default config;
