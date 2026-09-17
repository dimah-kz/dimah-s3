import { config } from "@workspace/eslint-config/react";
import { defineConfig } from "eslint/config";

export default defineConfig(config, {
  files: ["src/components/ui/**/*.{ts,tsx}"],
  rules: {
    // shadcn primitives: association happens at the call site.
    "jsx-a11y/label-has-associated-control": "off",
  },
});
