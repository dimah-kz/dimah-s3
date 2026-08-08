import { defineConfig } from "tsup";

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
  // Shebang only needed for the bin entry; harmless on transform.
  banner: {
    js: "#!/usr/bin/env node",
  },
  skipNodeModulesBundle: true,
  external: [/^[^./]/],
});
