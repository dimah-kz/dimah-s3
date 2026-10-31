// Checks that every <AutoTypeTable> in the docs content resolves: its `path`
// exists, and its `name` (or inline `type`) generates a table, the same way
// the docs build does. Run from apps/docs:
//
//   node scripts/check-type-tables.mts [file or folder ...]
//
// With no arguments it checks all of `content/`.

import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator, createProject } from "fumadocs-typescript";

const docsRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
/** AutoTypeTable `path` props are relative to the monorepo root. */
const repoRoot = path.join(docsRoot, "../..");

type Table = {
  file: string;
  line: number;
  path?: string;
  name?: string;
  type?: string;
};

type Problem = { table: Table; message: string };

const TAG = "<AutoTypeTable";
const TABLE_PROPS = ["path", "name", "type"] as const;

async function main() {
  const targets = process.argv.slice(2);
  const files = await collectFiles(
    targets.length > 0 ? targets : [path.join(docsRoot, "content")],
  );

  const tables: Table[] = [];
  const problems: Problem[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const result of findTables(file, source)) {
      if ("message" in result) problems.push(result);
      else tables.push(result);
    }
  }

  const projects = new Map<string, Awaited<ReturnType<typeof createProject>>>();
  try {
    for (const table of tables) {
      const message = await checkTable(table, projects);
      if (message) problems.push({ table, message });
    }
  } finally {
    for (const project of projects.values()) project.close();
  }

  problems.sort(
    (a, b) =>
      a.table.file.localeCompare(b.table.file) || a.table.line - b.table.line,
  );
  for (const { table, message } of problems) {
    const where = path.relative(docsRoot, table.file).replaceAll("\\", "/");
    console.error(`${where}:${table.line} ${describe(table)}: ${message}`);
  }
  const checked = `${tables.length} type tables in ${files.length} files`;
  if (problems.length > 0) {
    console.error(`\n${problems.length} problems (${checked}).`);
    process.exitCode = 1;
  } else {
    console.log(`Checked ${checked}.`);
  }
}

/** `.md` and `.mdx` files under each target, sorted. */
async function collectFiles(targets: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const target of targets) {
    const full = path.resolve(target);
    if ((await stat(full)).isDirectory()) {
      const entries = await readdir(full, { recursive: true });
      for (const entry of entries) {
        if (/\.mdx?$/.test(entry)) files.push(path.join(full, entry));
      }
    } else {
      files.push(full);
    }
  }
  return [...new Set(files)].sort();
}

/** Every AutoTypeTable outside fenced code blocks, or why one cannot be read. */
function findTables(file: string, source: string): Array<Table | Problem> {
  const text = maskCodeFences(source);
  const results: Array<Table | Problem> = [];
  for (let at = text.indexOf(TAG); at !== -1; at = text.indexOf(TAG, at + 1)) {
    const after = text[at + TAG.length];
    if (after !== undefined && /[\w.]/.test(after)) continue;

    const table: Table = { file, line: lineOf(text, at) };
    const attributes = readAttributes(text, at + TAG.length);
    if (typeof attributes === "string") {
      results.push({ table, message: attributes });
      continue;
    }
    table.path = attributes.get("path") ?? undefined;
    table.name = attributes.get("name") ?? undefined;
    table.type = attributes.get("type") ?? undefined;
    const dynamic = TABLE_PROPS.find((key) => attributes.get(key) === null);
    results.push(
      dynamic ? { table, message: `\`${dynamic}\` must be a string` } : table,
    );
  }
  return results;
}

/** Blanks fenced code blocks, keeping line breaks so line numbers hold. */
function maskCodeFences(source: string): string {
  let fence: string | null = null;
  return source
    .split("\n")
    .map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence === null) {
        if (marker) fence = marker;
        return marker ? "" : line;
      }
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
      return "";
    })
    .join("\n");
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === "\n") line++;
  return line;
}

/**
 * Reads JSX attributes up to the end of the opening tag. A string literal,
 * or a `{"…"}` / `{`…`}` expression without interpolation, gives its value;
 * any other expression gives `null`. Returns an error message when the tag
 * does not close.
 */
function readAttributes(
  text: string,
  start: number,
): Map<string, string | null> | string {
  const attributes = new Map<string, string | null>();
  let i = start;
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) return "tag is not closed";
    if (text.startsWith("/>", i) || text[i] === ">") return attributes;

    if (text[i] === "{") {
      // A spread such as {...props}.
      const end = matchBrace(text, i);
      if (end === -1) return "unbalanced `{` in tag";
      i = end + 1;
      continue;
    }

    const name = /^[\w:-]+/.exec(text.slice(i))?.[0];
    if (!name) return `unexpected \`${text[i]}\` in tag`;
    i += name.length;
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] !== "=") {
      attributes.set(name, "true");
      continue;
    }
    i++;
    while (i < text.length && /\s/.test(text[i])) i++;

    const quote = text[i];
    if (quote === '"' || quote === "'") {
      const end = text.indexOf(quote, i + 1);
      if (end === -1) return `unterminated value for \`${name}\``;
      attributes.set(name, text.slice(i + 1, end));
      i = end + 1;
    } else if (quote === "{") {
      const end = matchBrace(text, i);
      if (end === -1) return `unbalanced \`{\` in \`${name}\``;
      attributes.set(name, literalValue(text.slice(i + 1, end).trim()));
      i = end + 1;
    } else {
      return `unexpected value for \`${name}\``;
    }
  }
}

/** Index of the `}` closing the `{` at `open`, skipping strings, or -1. */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const char = text[i];
    if (char === '"' || char === "'" || char === "`") {
      i = skipString(text, i);
      if (i === -1) return -1;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function skipString(text: string, open: number): number {
  const quote = text[open];
  for (let i = open + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === quote) return i;
  }
  return -1;
}

function literalValue(expression: string): string | null {
  const quote = expression[0];
  if (
    expression.length < 2 ||
    !(quote === '"' || quote === "'" || quote === "`") ||
    skipString(expression, 0) !== expression.length - 1
  ) {
    return null;
  }
  const body = expression.slice(1, -1);
  if (quote === "`") return body.includes("${") ? null : body;
  try {
    return JSON.parse(quote === '"' ? expression : `"${body}"`) as string;
  } catch {
    return null;
  }
}

/**
 * The tsconfig the docs use for `filePath`. Mirrors `typeTableGeneratorFor`
 * in src/lib/type-table-generator.ts: package sources resolve `@/` against
 * their own package.
 */
function tsconfigFor(filePath?: string): string {
  const pkg = filePath?.replaceAll("\\", "/").match(/packages\/([^/]+)\//)?.[1];
  return pkg
    ? path.join(repoRoot, "packages", pkg, "tsconfig.json")
    : path.join(docsRoot, "tsconfig.json");
}

async function checkTable(
  table: Table,
  projects: Map<string, Awaited<ReturnType<typeof createProject>>>,
): Promise<string | undefined> {
  if (table.path === undefined && table.type === undefined) {
    return "needs a `path` or a `type`";
  }
  if (table.path !== undefined) {
    if (!existsSync(path.join(repoRoot, table.path))) {
      return "file does not exist";
    }
    if (table.name === undefined && table.type === undefined) {
      return "`path` without `name` renders nothing";
    }
  }

  const tsconfigPath = tsconfigFor(table.path);
  let project = projects.get(tsconfigPath);
  if (!project) {
    project = await createProject({ tsconfigPath });
    projects.set(tsconfigPath, project);
  }

  try {
    const output = await createGenerator({ project }).generateTypeTable(
      { path: table.path, name: table.name, type: table.type },
      { basePath: repoRoot },
    );
    if (output.length === 0) return "generates an empty table";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return table.path === undefined
      ? message
      : message.replaceAll(path.join(repoRoot, table.path), table.path);
  }
  return undefined;
}

function describe(table: Table): string {
  const parts = [
    table.name !== undefined && `name="${table.name}"`,
    table.path !== undefined && `path="${table.path}"`,
    table.type !== undefined && "type={…}",
  ].filter(Boolean);
  return `<AutoTypeTable ${parts.join(" ")}>`;
}

await main();
