/// <reference types="node" />
import { createRequire } from "node:module";
import { defineConfig } from "tsup";

const { version } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/client/index.ts"],
  format: ["esm"],
  target: "esnext",
  dts: false,
  define: {
    __DIMAH_S3_DB_VERSION__: JSON.stringify(version),
  },
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
