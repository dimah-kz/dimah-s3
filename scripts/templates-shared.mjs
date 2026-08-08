/**
 * Shared helpers for standalone `templates/<id>/` maintenance scripts.
 * Templates are not pnpm workspace members — see templates/AGENTS.md.
 *
 * Also imported by `packages/cli/scripts/snapshot-templates.mjs` so catalog
 * validation stays a single source of truth.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const workspaceRoot = resolve(__dirname, "..");
export const templatesRoot = resolve(workspaceRoot, "templates");
export const catalogPath = resolve(templatesRoot, "catalog.json");

/**
 * @typedef {{ id: string, title: string, hint?: string, srcLayout?: boolean }} CatalogEntry
 */

/**
 * Load and validate every catalog entry (id + title required).
 * @returns {CatalogEntry[]}
 */
export function listCatalogEntries() {
  if (!existsSync(catalogPath)) {
    throw new Error(`Missing templates catalog at ${catalogPath}`);
  }
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const templates = catalog.templates;
  if (!Array.isArray(templates) || templates.length === 0) {
    throw new Error("templates/catalog.json must list at least one template");
  }
  /** @type {CatalogEntry[]} */
  const entries = [];
  for (const entry of templates) {
    const id = entry?.id;
    if (typeof id !== "string" || !id) {
      throw new Error("Each catalog entry needs a string id");
    }
    if (typeof entry.title !== "string" || !entry.title) {
      throw new Error(`Catalog entry "${id}" needs a string title`);
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * @returns {string[]}
 */
export function listTemplateIds() {
  return listCatalogEntries().map((entry) => entry.id);
}

/**
 * Resolve which template ids to run. Pass ids as argv (after flags) to filter.
 * @param {string[]} argv
 * @returns {string[]}
 */
export function resolveTemplateIds(argv = process.argv.slice(2)) {
  const requested = argv.filter((arg) => !arg.startsWith("-"));
  const all = listTemplateIds();
  if (requested.length === 0) return all;

  const unknown = requested.filter((id) => !all.includes(id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown template id(s): ${unknown.join(", ")} (known: ${all.join(", ")})`,
    );
  }
  return requested;
}

/**
 * @param {string} id
 */
export function templateDir(id) {
  const dir = resolve(templatesRoot, id);
  if (!existsSync(dir)) {
    throw new Error(`Template folder missing: ${dir}`);
  }
  if (!existsSync(resolve(dir, "package.json"))) {
    throw new Error(`Missing package.json in ${dir}`);
  }
  return dir;
}

/**
 * Run a command with stdio inherited.
 * Windows needs `shell: true` to resolve `.cmd` shims; pass a single command
 * string there to avoid Node's DEP0190 (args + shell).
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 */
export function run(command, args, cwd) {
  console.log(`\n[${cwd}] ${command} ${args.join(" ")}`);
  /** @type {import("node:child_process").SpawnSyncReturns<Buffer>} */
  let result;
  if (process.platform === "win32") {
    const line = [command, ...args]
      .map((part) =>
        /[\s"]/.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part,
      )
      .join(" ");
    result = spawnSync(line, {
      cwd,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
  } else {
    result = spawnSync(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(" ")} (in ${cwd})`,
    );
  }
}

/**
 * Fail if a template package.json still has workspace/catalog/@workspace leaks.
 * @param {string} dir
 */
export function assertConcreteNpmRanges(dir) {
  const pkg = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"));
  const fields = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];
  for (const field of fields) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range !== "string") continue;
      if (
        range.startsWith("workspace:") ||
        range.startsWith("catalog:") ||
        name.startsWith("@workspace/")
      ) {
        throw new Error(
          `${dir}/package.json ${field}["${name}"] must use a concrete npm range (got "${range}")`,
        );
      }
    }
  }
}

/**
 * Whether `package.json` defines a given npm script.
 * @param {string} dir
 * @param {string} script
 */
export function hasScript(dir, script) {
  const pkg = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"));
  return Boolean(pkg.scripts?.[script]);
}
