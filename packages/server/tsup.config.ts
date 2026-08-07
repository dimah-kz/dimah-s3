import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/adapters/next.ts",
    "src/adapters/node.ts",
    "src/adapters/express.ts",
    "src/adapters/hono.ts",
    "src/adapters/fastify.ts",
    "src/adapters/elysia.ts",
    "src/adapters/svelte-kit.ts",
  ],
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
