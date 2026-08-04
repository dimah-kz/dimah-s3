import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/adapters/next.ts", "src/adapters/node.ts"],
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
});
