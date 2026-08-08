/**
 * Shared helpers for standalone `templates/<id>/` scripts and CLI snapshot.
 * Templates are not pnpm workspace members — see templates/AGENTS.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const templatesRoot = resolve(__dirname, "..", "templates");
export const catalogPath = resolve(templatesRoot, "catalog.json");

/** @returns {{ id: string, title: string }[]} */
export function listCatalogEntries() {
  if (!existsSync(catalogPath)) {
    throw new Error(`Missing templates catalog at ${catalogPath}`);
  }
  const { templates } = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (!Array.isArray(templates) || templates.length === 0) {
    throw new Error("templates/catalog.json must list at least one template");
  }
  for (const entry of templates) {
    if (typeof entry?.id !== "string" || !entry.id) {
      throw new Error("Each catalog entry needs a string id");
    }
    if (typeof entry.title !== "string" || !entry.title) {
      throw new Error(`Catalog entry "${entry.id}" needs a string title`);
    }
  }
  return templates;
}

/** @param {string[]} [argv] */
export function resolveTemplateIds(argv = process.argv.slice(2)) {
  const requested = argv.filter((arg) => !arg.startsWith("-"));
  const all = listCatalogEntries().map((e) => e.id);
  if (requested.length === 0) return all;

  const unknown = requested.filter((id) => !all.includes(id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown template id(s): ${unknown.join(", ")} (known: ${all.join(", ")})`,
    );
  }
  return requested;
}

/** @param {string} id */
export function templateDir(id) {
  const dir = resolve(templatesRoot, id);
  if (!existsSync(dir) || !existsSync(resolve(dir, "package.json"))) {
    throw new Error(`Template folder missing or incomplete: ${dir}`);
  }
  return dir;
}

/**
 * Windows needs `shell: true` for `.cmd` shims; pass a single string there
 * to avoid Node DEP0190 (args + shell).
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 */
export function run(command, args, cwd) {
  console.log(`\n[${cwd}] ${command} ${args.join(" ")}`);
  const result =
    process.platform === "win32"
      ? spawnSync(
          [command, ...args]
            .map((part) =>
              /[\s"]/.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part,
            )
            .join(" "),
          { cwd, stdio: "inherit", shell: true, env: process.env },
        )
      : spawnSync(command, args, {
          cwd,
          stdio: "inherit",
          env: process.env,
        });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(" ")} (in ${cwd})`,
    );
  }
}

/** @param {string} dir */
export function assertConcreteNpmRanges(dir) {
  const pkg = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"));
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
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
