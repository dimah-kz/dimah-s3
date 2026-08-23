import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";

const SHEBANG = "#!/usr/bin/env node\n";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "snapshot/transform": "src/snapshot/transform.ts",
  },
  format: ["esm"],
  platform: "node",
  target: "node20",
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
    const indexPath = "dist/index.js";
    const content = readFileSync(indexPath, "utf8");
    if (!content.startsWith("#!")) {
      writeFileSync(indexPath, `${SHEBANG}${content}`);
    }
  },
});
