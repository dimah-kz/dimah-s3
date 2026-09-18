import { defineConfig, type Options } from "tsup";

const defaults = {
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
} satisfies Omit<Options, "entry">;

export function packageConfig(options: Options) {
  const { esbuildOptions, ...rest } = options;

  return defineConfig({
    ...defaults,
    ...rest,
    esbuildOptions(esbuildOpts, ctx) {
      esbuildOpts.alias = {
        "@": "./src",
        ...esbuildOpts.alias,
      };
      esbuildOptions?.(esbuildOpts, ctx);
    },
  });
}
