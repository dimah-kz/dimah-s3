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
  plugins: ["prettier-plugin-packagejson"],
  overrides: [
    {
      files: ["**/*.md"],
      options: { proseWrap: "preserve" },
    },
    {
      files: ["**/*.{yml,yaml}"],
      options: { singleQuote: false },
    },
  ],
};

export default config;
