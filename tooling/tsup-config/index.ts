import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Options, type Plugin } from "tsup";

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

const CLIENT_DIRECTIVE = '"use client";\n';
const JS_OUTPUT = /\.(?:c|m)?js$/;

export type PackageConfigOptions = Options & {
  /**
   * Entry names whose output starts with `"use client"`, such as `"index"`.
   * Shared chunks and the other entries stay directive-free.
   */
  clientEntries?: readonly string[];
};

export function packageConfig(options: PackageConfigOptions) {
  const { esbuildOptions, clientEntries = [], plugins = [], ...rest } = options;

  return defineConfig({
    ...defaults,
    ...rest,
    plugins:
      clientEntries.length > 0
        ? [...plugins, clientDirective(clientEntries)]
        : plugins,
    esbuildOptions(esbuildOpts, ctx) {
      esbuildOpts.alias = {
        "@": "./src",
        ...esbuildOpts.alias,
      };
      esbuildOptions?.(esbuildOpts, ctx);
    },
  });
}

/**
 * Prepends `"use client"` to the output of the named entries.
 * Bundling and Rollup tree-shaking strip module-level directives, so this
 * runs once the files are written. External source maps are shifted by one
 * line to match.
 */
function clientDirective(entries: readonly string[]): Plugin {
  return {
    name: "client-directive",
    async buildEnd({ writtenFiles }) {
      const outDir = path.resolve(this.options.outDir);
      const written = new Set(
        writtenFiles.map((file) => path.resolve(file.name)),
      );
      const missing = new Set(entries);

      for (const file of written) {
        if (!JS_OUTPUT.test(file)) continue;
        const name = path
          .relative(outDir, file)
          .replace(JS_OUTPUT, "")
          .split(path.sep)
          .join("/");
        if (!entries.includes(name)) continue;

        missing.delete(name);
        await prependDirective(file, written.has(`${file}.map`));
      }

      if (missing.size > 0) {
        throw new Error(
          `clientEntries has no matching output: ${[...missing].join(", ")}`,
        );
      }
    },
  };
}

async function prependDirective(file: string, hasSourceMap: boolean) {
  const code = await readFile(file, "utf8");
  if (code.startsWith(CLIENT_DIRECTIVE)) return;
  await writeFile(file, CLIENT_DIRECTIVE + code);

  if (!hasSourceMap) return;
  const mapFile = `${file}.map`;
  const map = JSON.parse(await readFile(mapFile, "utf8")) as {
    mappings: string;
  };
  // An empty first line in the mappings moves every segment down one line.
  map.mappings = `;${map.mappings}`;
  await writeFile(mapFile, JSON.stringify(map));
}
