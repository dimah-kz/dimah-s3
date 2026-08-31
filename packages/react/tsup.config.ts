import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    engine: "src/engine.ts",
  },
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
  banner: { js: '"use client";' },
  esbuildOptions(options) {
    options.alias = {
      "@": "./src",
    };
  },
});
