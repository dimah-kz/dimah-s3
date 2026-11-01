/**
 * Checks the built `dist` of every published `@dimah-s3/*` package. Run it
 * after `pnpm build`:
 *
 * 1. Every `exports`, `bin` and `files` path in package.json exists, and every
 *    JS entry has its `types` file.
 * 2. Every runtime export of a JS entry is declared in that entry's types.
 * 3. `"use client"` starts the client entries (react and ui `dist/index.js`)
 *    and no other emitted JS file.
 * 4. `@dimah-s3/react/engine`, with every chunk it imports, imports no React
 *    module, no react entry re-exports a value from `@dimah-s3/core`, and
 *    the browser entry of `@dimah-s3/core` imports no Zod (the schemas live
 *    in `@dimah-s3/core/schema`).
 * 5. An exact peer range on another `@dimah-s3/*` package equals its version.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(root, "packages");

/** Entries whose output must start with `"use client"`, per package. */
const CLIENT_ENTRIES = new Map([
  ["@dimah-s3/react", ["dist/index.js"]],
  ["@dimah-s3/ui", ["dist/index.js"]],
]);

/** Entries that must stay free of React, per package. */
const REACT_FREE_ENTRIES = new Map([["@dimah-s3/react", ["dist/engine.js"]]]);

/** Entries that must stay free of Zod, per package: they ship to browsers. */
const ZOD_FREE_ENTRIES = new Map([["@dimah-s3/core", ["dist/index.js"]]]);

const ZOD_MODULE = /^zod(?:\/|$)/;

const REACT_MODULE =
  /^(?:react|react-dom|react-dropzone|@fuma-translate\/react)(?:\/|$)/;
const CLIENT_DIRECTIVE = /^(["'])use client\1/;
const JS_FILE = /\.(?:c|m)?js$/;
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;

/** @type {string[]} */
const failures = [];

/**
 * @param {string} name
 * @param {string} message
 */
function fail(name, message) {
  failures.push(`${name}: ${message}`);
}

/** @param {string} file */
function read(file) {
  return readFileSync(file, "utf8");
}

/** @param {string} file */
function toPosix(file) {
  return file.split(sep).join("/");
}

/**
 * @typedef {{
 *   name: string;
 *   version: string;
 *   private?: boolean;
 *   exports?: unknown;
 *   bin?: string | Record<string, string>;
 *   files?: string[];
 *   peerDependencies?: Record<string, string>;
 * }} Manifest
 * @typedef {{ dir: string; manifest: Manifest }} PublishedPackage
 */

/** @returns {PublishedPackage[]} */
function publishedPackages() {
  /** @type {PublishedPackage[]} */
  const out = [];
  for (const entry of readdirSync(packagesDir)) {
    const dir = join(packagesDir, entry);
    const manifestPath = join(dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    /** @type {Manifest} */
    const manifest = JSON.parse(read(manifestPath));
    if (manifest.private || !manifest.name.startsWith("@dimah-s3/")) continue;
    out.push({ dir, manifest });
  }
  return out.toSorted((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

/**
 * Entries from `exports`: each subpath with its JS file and types file.
 * Non-JS targets (CSS) come back with `js` unset.
 *
 * @param {unknown} exportsField
 * @returns {{ subpath: string; js?: string; types?: string; other: string[] }[]}
 */
function exportEntries(exportsField) {
  if (exportsField === undefined) return [];
  const map =
    typeof exportsField === "string" ? { ".": exportsField } : exportsField;
  if (map === null || typeof map !== "object") return [];

  return Object.entries(map).map(([subpath, target]) => {
    /** @type {string[]} */
    const targets = [];
    /** @type {string | undefined} */
    let types;
    /** @param {unknown} value @param {string} [condition] */
    const walk = (value, condition) => {
      if (typeof value === "string") {
        if (condition === "types") types = value;
        else targets.push(value);
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) walk(inner, key);
      }
    };
    walk(target);
    const js = targets.find((file) => JS_FILE.test(file));
    return {
      subpath,
      js,
      types,
      other: targets.filter((file) => file !== js),
    };
  });
}

/** @param {string} source */
function stripComments(source) {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/.*$/gm, "");
}

/**
 * Names a declaration file exports, following relative `export * from`.
 *
 * @param {string} file
 * @param {Set<string>} [seen]
 * @returns {Set<string>}
 */
function declaredNames(file, seen = new Set()) {
  /** @type {Set<string>} */
  const names = new Set();
  if (seen.has(file) || !existsSync(file)) return names;
  seen.add(file);
  const source = stripComments(read(file));

  const declaration =
    /export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|enum|namespace|interface|type)\s+([\w$]+)/g;
  for (const match of source.matchAll(declaration)) names.add(match[1]);

  if (/export\s+default\b/.test(source)) names.add("default");

  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of match[1].split(",")) {
      const spec = part.trim().replace(/^type\s+/, "");
      if (!spec) continue;
      names.add(
        spec
          .split(/\s+as\s+/)
          .at(-1)
          .trim(),
      );
    }
  }

  for (const match of source.matchAll(/export\s+\*\s+as\s+([\w$]+)\s+from/g)) {
    names.add(match[1]);
  }

  for (const match of source.matchAll(
    /export\s+\*\s+from\s+["']([^"']+)["']/g,
  )) {
    const target = resolveDeclaration(dirname(file), match[1]);
    if (!target) continue;
    for (const name of declaredNames(target, seen)) {
      if (name !== "default") names.add(name);
    }
  }
  return names;
}

/**
 * @param {string} fromDir
 * @param {string} specifier
 */
function resolveDeclaration(fromDir, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(fromDir, specifier.replace(JS_FILE, ""));
  return [`${base}.d.ts`, join(base, "index.d.ts")].find((file) =>
    existsSync(file),
  );
}

/**
 * Static and dynamic import specifiers of an emitted ESM file.
 *
 * @param {string} source
 */
function importSpecifiers(source) {
  const code = stripComments(source);
  /** @type {string[]} */
  const out = [];
  const statement =
    /(?:^|[\s;}])(?:import|export)(?:[^'";]*?[\s*}]from)?\s*["']([^"']+)["']/g;
  for (const match of code.matchAll(statement)) out.push(match[1]);
  for (const match of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    out.push(match[1]);
  }
  return out;
}

/**
 * The file and every relative JS file it imports, transitively.
 *
 * @param {string} entry
 */
function importGraph(entry) {
  /** @type {Set<string>} */
  const files = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.pop());
    if (files.has(file) || !existsSync(file)) continue;
    files.add(file);
    for (const specifier of importSpecifiers(read(file))) {
      if (specifier.startsWith("."))
        queue.push(resolve(dirname(file), specifier));
    }
  }
  return files;
}

/** @param {string} source */
function hasClientDirective(source) {
  const code = source
    .replace(/^#!.*\n/, "")
    .replace(/^(?:\s|\/\*[\s\S]*?\*\/|\/\/.*\n)*/, "");
  return CLIENT_DIRECTIVE.test(code);
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function jsFiles(dir) {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsFiles(full));
    else if (JS_FILE.test(entry)) out.push(full);
  }
  return out;
}

/** @param {string} file */
async function importModule(file) {
  return /** @type {Record<string, unknown>} */ (
    await import(pathToFileURL(file).href)
  );
}

const packages = publishedPackages();
const versions = new Map(
  packages.map(({ manifest }) => [manifest.name, manifest.version]),
);
/** @type {Map<string, Record<string, unknown>>} */
const loaded = new Map();

for (const { dir, manifest } of packages) {
  const { name } = manifest;

  // 1. Paths in package.json.
  for (const file of manifest.files ?? []) {
    if (!existsSync(join(dir, file)))
      fail(name, `files entry "${file}" is missing`);
  }
  const bins =
    typeof manifest.bin === "string"
      ? [manifest.bin]
      : Object.values(manifest.bin ?? {});
  for (const bin of bins) {
    if (!existsSync(join(dir, bin))) fail(name, `bin "${bin}" is missing`);
  }

  for (const entry of exportEntries(manifest.exports)) {
    const label = `exports["${entry.subpath}"]`;
    for (const file of entry.other) {
      if (!existsSync(join(dir, file)))
        fail(name, `${label} "${file}" is missing`);
    }
    if (!entry.js) continue;
    const jsPath = join(dir, entry.js);
    if (!existsSync(jsPath)) {
      fail(name, `${label} "${entry.js}" is missing`);
      continue;
    }
    if (entry.types && !existsSync(join(dir, entry.types))) {
      fail(name, `${label} types "${entry.types}" is missing`);
      continue;
    }

    // 2. Runtime exports are declared. A bin-only entry has no types.
    if (!entry.types) continue;
    /** @type {Record<string, unknown>} */
    let runtime;
    try {
      runtime = await importModule(jsPath);
    } catch (error) {
      fail(name, `${label} failed to load: ${String(error)}`);
      continue;
    }
    loaded.set(`${name}:${entry.subpath}`, runtime);
    const declared = declaredNames(join(dir, entry.types));
    const missing = Object.keys(runtime).filter((key) => !declared.has(key));
    if (missing.length > 0) {
      fail(name, `${label} types do not declare: ${missing.join(", ")}`);
    }
  }

  // 3. "use client" only on the client entries.
  const clientEntries = new Set(
    (CLIENT_ENTRIES.get(name) ?? []).map((file) => resolve(dir, file)),
  );
  for (const file of clientEntries) {
    if (!existsSync(file)) {
      fail(name, `client entry "${toPosix(relative(dir, file))}" is missing`);
    } else if (!hasClientDirective(read(file))) {
      fail(
        name,
        `"${toPosix(relative(dir, file))}" must start with "use client"`,
      );
    }
  }
  for (const file of jsFiles(join(dir, "dist"))) {
    if (clientEntries.has(file)) continue;
    if (hasClientDirective(read(file))) {
      fail(
        name,
        `"${toPosix(relative(dir, file))}" must not start with "use client"`,
      );
    }
  }

  // 4a. React-free entries.
  for (const entry of REACT_FREE_ENTRIES.get(name) ?? []) {
    for (const file of importGraph(resolve(dir, entry))) {
      const shown = toPosix(relative(dir, file));
      const imports = importSpecifiers(read(file)).filter((specifier) =>
        REACT_MODULE.test(specifier),
      );
      if (imports.length > 0) {
        fail(name, `"${shown}" (from ${entry}) imports ${imports.join(", ")}`);
      }
      if (hasClientDirective(read(file))) {
        fail(name, `"${shown}" (from ${entry}) starts with "use client"`);
      }
    }
  }

  // 4c. Zod-free browser entries.
  for (const entry of ZOD_FREE_ENTRIES.get(name) ?? []) {
    for (const file of importGraph(resolve(dir, entry))) {
      const imports = importSpecifiers(read(file)).filter((specifier) =>
        ZOD_MODULE.test(specifier),
      );
      if (imports.length > 0) {
        const shown = toPosix(relative(dir, file));
        fail(name, `"${shown}" (from ${entry}) imports ${imports.join(", ")}`);
      }
    }
  }

  // 5. Exact peers on the release group match the current versions.
  for (const [peer, range] of Object.entries(manifest.peerDependencies ?? {})) {
    const version = versions.get(peer);
    if (!version || !EXACT_VERSION.test(range)) continue;
    if (range !== version) {
      fail(name, `peer ${peer} is "${range}", but ${peer} is ${version}`);
    }
  }
}

// 4b. React entries re-export nothing from core.
const core = loaded.get("@dimah-s3/core:.");
if (core) {
  for (const [id, runtime] of loaded) {
    if (!id.startsWith("@dimah-s3/react:")) continue;
    const reexported = Object.keys(runtime).filter(
      (key) => key in core && runtime[key] === core[key],
    );
    if (reexported.length > 0) {
      fail(id, `re-exports @dimah-s3/core values: ${reexported.join(", ")}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`check:dist found ${failures.length} problem(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "\nRun `pnpm build` first, then fix the package or its manifest.",
  );
  process.exit(1);
}

console.log(
  `check:dist: ${packages.length} packages OK (${packages
    .map(({ manifest }) => manifest.name)
    .join(", ")})`,
);
