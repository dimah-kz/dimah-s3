/**
 * Gives every relative import in the emitted declarations its `.js` path.
 * Each library package runs it after `tsc-alias`, from the package directory:
 *
 *   node ../../tooling/tsup-config/dts-extensions.mjs
 *
 * The packages compile with `moduleResolution: Bundler`, so `tsc` keeps
 * extensionless specifiers such as `export * from "./helpers"`. The packages
 * are `"type": "module"`, so under `moduleResolution: NodeNext` or `Node16`
 * their `.d.ts` files are ES modules, and an extensionless relative import
 * does not resolve: `export *` loses its names and re-exported values are
 * `any`. `pnpm check:dist` fails on any that remain.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const DECLARATION_FILE = /\.d\.ts$/;

/** `from "…"`, `import "…"`, and `import("…")` with a relative specifier. */
const RELATIVE_IMPORT =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.\.?(?:\/[^"'\r\n]*)?)\2/g;

const HAS_EXTENSION = /\.(?:c|m)?js$|\.json$/;

/** `.`, `..`, or a path ending in `/`, `/.`, or `/..`. */
const DIRECTORY_SPECIFIER = /(?:^|\/)\.{0,2}$/;

/**
 * @param {string} dir
 * @returns {string[]}
 */
function declarationFiles(dir) {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...declarationFiles(full));
    else if (DECLARATION_FILE.test(entry)) out.push(full);
  }
  return out;
}

/**
 * The specifier as Node.js resolves it: `./a` → `./a.js` when `a.d.ts`
 * exists, else `./a/index.js`. Unchanged when no declaration matches.
 *
 * @param {string} fromDir
 * @param {string} specifier
 */
function withExtension(fromDir, specifier) {
  const base = resolve(fromDir, specifier);
  if (!DIRECTORY_SPECIFIER.test(specifier) && existsSync(`${base}.d.ts`)) {
    return `${specifier}.js`;
  }
  if (existsSync(join(base, "index.d.ts"))) {
    return `${specifier.replace(/\/$/, "")}/index.js`;
  }
  return specifier;
}

for (const file of declarationFiles(resolve("dist"))) {
  const source = readFileSync(file, "utf8");
  const fromDir = dirname(file);
  const output = source.replaceAll(
    RELATIVE_IMPORT,
    (match, prefix, quote, specifier) =>
      HAS_EXTENSION.test(specifier)
        ? match
        : `${prefix}${quote}${withExtension(fromDir, specifier)}${quote}`,
  );
  if (output !== source) writeFileSync(file, output);
}
