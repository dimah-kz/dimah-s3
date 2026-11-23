/**
 * Writes the public API report of the client packages from their built
 * declarations, or checks it with `--check`. Run it after `pnpm build`.
 *
 * Each report lists every `.d.ts` file an `exports` entry reaches through
 * relative imports, without comments, so a change to a public type, prop or
 * signature shows up as a diff of `packages/<name>/api-report.md`. Doc
 * comment edits and internal modules that no public declaration imports do
 * not change it.
 *
 *   pnpm api:report          rewrite the reports
 *   pnpm api:report --check  fail when a build differs from its report
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Package folders under `packages/` that get a report. */
const PACKAGES = ["react", "ui"];

const REPORT_FILE = "api-report.md";
const JS_FILE = /\.(?:c|m)?js$/;

const check = process.argv.includes("--check");

/** @param {string} file */
function toPosix(file) {
  return file.split(sep).join("/");
}

/**
 * Removes comments, leaving string and template literals alone, so a
 * literal type such as `"image/*"` survives.
 *
 * @param {string} source
 */
function stripComments(source) {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      let end = index + 1;
      while (end < source.length && source[end] !== char) {
        end += source[end] === "\\" ? 2 : 1;
      }
      out += source.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/**
 * Relative module specifiers a declaration file imports or re-exports.
 *
 * @param {string} source
 */
function relativeSpecifiers(source) {
  /** @type {string[]} */
  const out = [];
  const patterns = [
    /\bfrom\s+["'](\.[^"']*)["']/g,
    /\bimport\s+["'](\.[^"']*)["']/g,
    /\bimport\(\s*["'](\.[^"']*)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) out.push(match[1]);
  }
  return out;
}

/**
 * @param {string} fromDir
 * @param {string} specifier
 */
function resolveDeclaration(fromDir, specifier) {
  const base = resolve(fromDir, specifier.replace(JS_FILE, ""));
  return [`${base}.d.ts`, join(base, "index.d.ts")].find((file) =>
    existsSync(file),
  );
}

/**
 * Subpaths of `exports` with their declaration file.
 *
 * @param {unknown} exportsField
 * @returns {{ subpath: string; types: string }[]}
 */
function typedEntries(exportsField) {
  if (!exportsField || typeof exportsField !== "object") return [];
  /** @type {{ subpath: string; types: string }[]} */
  const out = [];
  for (const [subpath, target] of Object.entries(exportsField)) {
    if (target && typeof target === "object" && "types" in target) {
      const { types } = /** @type {{ types: unknown }} */ (target);
      if (typeof types === "string") out.push({ subpath, types });
    }
  }
  return out;
}

/**
 * The declaration files `entries` reach, each with its comment-free source.
 *
 * @param {string[]} entries
 * @returns {Map<string, string>}
 */
function declarationGraph(entries) {
  /** @type {Map<string, string>} */
  const files = new Map();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    if (files.has(file)) continue;
    const source = stripComments(readFileSync(file, "utf8"));
    files.set(file, source);
    for (const specifier of relativeSpecifiers(source)) {
      const target = resolveDeclaration(dirname(file), specifier);
      if (target) queue.push(target);
      else throw new Error(`${file}: cannot resolve "${specifier}"`);
    }
  }
  return files;
}

/** @param {string} source */
function tidy(source) {
  return source
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && line.trim() !== "export {};")
    .join("\n");
}

/**
 * @param {string} dir
 * @returns {Promise<{ name: string; file: string; report: string }>}
 */
async function buildReport(dir) {
  const packageDir = join(root, "packages", dir);
  /** @type {{ name: string; exports?: unknown }} */
  const manifest = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  );
  const entries = typedEntries(manifest.exports);
  const entryFiles = entries.map(({ types }) => join(packageDir, types));
  for (const file of entryFiles) {
    if (!existsSync(file)) {
      throw new Error(`${manifest.name}: ${file} is missing. Run pnpm build.`);
    }
  }
  const graph = declarationGraph(entryFiles);
  const distDir = join(packageDir, "dist");
  const label = (/** @type {string} */ file) =>
    toPosix(relative(distDir, file));

  const sections = [...graph.entries()]
    .toSorted(([a], [b]) => label(a).localeCompare(label(b)))
    .map(([file, source]) => {
      const body = tidy(source);
      return `## \`${label(file)}\`\n\n\`\`\`ts\n${body}\n\`\`\``;
    });

  const markdown = [
    `# ${manifest.name} public API`,
    "Generated from the built declarations by `pnpm api:report`. Do not edit it by hand. CI fails when a build differs from it, so review its diff as a change to the public API.",
    entries
      .map(
        ({ subpath, types }) =>
          `- \`${toPosix(join(manifest.name, subpath))}\`: \`${label(join(packageDir, types))}\``,
      )
      .join("\n"),
    ...sections,
  ].join("\n\n");

  const file = join(packageDir, REPORT_FILE);
  const options = (await prettier.resolveConfig(file)) ?? {};
  const report = await prettier.format(markdown, {
    ...options,
    filepath: file,
  });
  return { name: manifest.name, file, report };
}

/** @type {string[]} */
const stale = [];
for (const dir of PACKAGES) {
  const { name, file, report } = await buildReport(dir);
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (current === report) continue;
  if (check) {
    stale.push(`${name}: ${toPosix(relative(root, file))}`);
  } else {
    writeFileSync(file, report);
    console.log(`Wrote ${toPosix(relative(root, file))}`);
  }
}

if (stale.length > 0) {
  console.error(
    [
      "The public API differs from its report:",
      ...stale.map((line) => `  - ${line}`),
      "Run `pnpm build && pnpm api:report`, review the diff, and commit it.",
    ].join("\n"),
  );
  process.exit(1);
}
if (check) console.log("API reports match the build.");
