import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "tsup";

const CLIENT_DIRECTIVE = '"use client";\n';

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "esnext",
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  outDir: "dist",
  skipNodeModulesBundle: true,
  external: [/^[^./]/],
  esbuildOptions(options) {
    options.alias = {
      "@": "./src",
    };
  },
  async onSuccess() {
    // esbuild strips module-level "use client" during bundle; restore for Next RSC.
    const file = "dist/index.js";
    const content = await readFile(file, "utf8");
    if (
      !content.startsWith('"use client"') &&
      !content.startsWith("'use client'")
    ) {
      await writeFile(file, CLIENT_DIRECTIVE + content);
    }
  },
});
