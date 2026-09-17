import { nextJsConfig } from "@workspace/eslint-config/next-js";
import { defineConfig } from "eslint/config";

export default defineConfig(nextJsConfig, {
  files: ["src/components/ui/**/*.{ts,tsx}"],
  rules: {
    // shadcn primitives: association happens at the call site.
    "jsx-a11y/label-has-associated-control": "off",
  },
});
