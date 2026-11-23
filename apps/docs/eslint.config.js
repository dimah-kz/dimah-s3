import { nextJsConfig } from "@workspace/eslint-config/next-js";
import { defineConfig } from "eslint/config";

const ogImageEngine = "Use renderImage from @/components/og/render-image.";

export default defineConfig(
  nextJsConfig,
  {
    // `next/og` can't shape Persian. Every generated image goes through the
    // one Takumi helper, so its fonts and engine change in one file.
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "next/og", message: ogImageEngine }],
          patterns: [
            { group: ["takumi-js", "takumi-js/*"], message: ogImageEngine },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/og/render-image.ts"],
    rules: { "no-restricted-imports": "off" },
  },
);
