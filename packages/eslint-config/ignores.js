/** Build artifacts and generated files — shared by all ESLint configs. */
export const ignorePatterns = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.next/**",
  "**/out/**",
  "**/build/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/next-env.d.ts",
  // tsup writes ephemeral bundled configs next to tsup.config.ts during builds
  "**/tsup.config.bundled_*.mjs",
];

/** @type {import("eslint").Linter.Config} */
export const globalIgnores = {
  ignores: ignorePatterns,
};
