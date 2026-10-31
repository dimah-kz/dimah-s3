/**
 * Shared helpers for standalone `templates/<id>/` scripts and CLI snapshot.
 * Templates are not pnpm workspace members — see templates/AGENTS.md.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(__dirname, "..");
export const templatesRoot = resolve(repoRoot, "templates");
export const catalogPath = resolve(templatesRoot, "catalog.json");

/** Signs upload tickets. `create` writes a generated value into `.env`. */
export const SECRET_ENV_KEY = "DIMAH_S3_SECRET";

/**
 * Upload ticket secret for smoke builds only (at least 32 characters). Never
 * use it in a deployed app.
 */
export const DEV_SECRET =
  "dimah-s3-templates-build-dev-secret-not-for-production";

/** Local-only files and build output that never leave `templates/<id>/`. */
export const TEMPLATE_COPY_EXCLUDE = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "dist-server",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "next-env.d.ts",
  ".vercel",
  ".DS_Store",
  ".git",
]);

/** `.env`, `.env.local`, … hold real values; only `.env.example` is source. */
function isLocalEnvFile(name) {
  return name.startsWith(".env") && name !== ".env.example";
}

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

/**
 * Copies a template folder, skipping `TEMPLATE_COPY_EXCLUDE`, local env files
 * and `*.tsbuildinfo`.
 * @param {string} src
 * @param {string} dest
 * @param {{ exclude?: Iterable<string> }} [options] Extra names to skip.
 */
export function copyTemplateDir(src, dest, options = {}) {
  const exclude = new Set([
    ...TEMPLATE_COPY_EXCLUDE,
    ...(options.exclude ?? []),
  ]);
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (exclude.has(entry) || isLocalEnvFile(entry)) continue;
    const from = join(src, entry);
    const to = join(dest, entry);
    if (statSync(from).isDirectory()) {
      copyTemplateDir(from, to, options);
      continue;
    }
    if (entry.endsWith(".tsbuildinfo")) continue;
    cpSync(from, to);
  }
}

const SECRET_LINE = new RegExp(
  String.raw`^(\s*(?:export\s+)?${SECRET_ENV_KEY}\s*=)(.*)$`,
  "m",
);

/**
 * Fails unless `.env.example` lists `DIMAH_S3_SECRET` with an empty value, so
 * `create` has a line to fill and no secret ships in a starter.
 * @param {string} dir
 */
export function assertEnvExampleSecret(dir) {
  const path = join(dir, ".env.example");
  if (!existsSync(path)) {
    throw new Error(`${path} is missing (it must list ${SECRET_ENV_KEY})`);
  }
  const match = SECRET_LINE.exec(readFileSync(path, "utf8"));
  if (!match) {
    throw new Error(`${path} must list ${SECRET_ENV_KEY}=""`);
  }
  const value = (match[2] ?? "").replace(/\s+#.*$/, "").trim();
  if (value !== "" && value !== '""' && value !== "''") {
    throw new Error(`${path} must leave ${SECRET_ENV_KEY} empty`);
  }
}

/**
 * Writes `.env` from `.env.example` when it is missing, with
 * `DIMAH_S3_SECRET` set to `secret`. An existing `.env` is left alone.
 * @param {string} dir
 * @param {string} [secret]
 */
export function writeSmokeEnv(dir, secret = DEV_SECRET) {
  const envFile = join(dir, ".env");
  if (existsSync(envFile)) return;
  const examplePath = join(dir, ".env.example");
  const example = existsSync(examplePath)
    ? readFileSync(examplePath, "utf8")
    : "";
  let content;
  if (SECRET_LINE.test(example)) {
    content = example.replace(SECRET_LINE, (_, head) => `${head}"${secret}"`);
  } else {
    const base =
      example === "" || example.endsWith("\n") ? example : `${example}\n`;
    content = `${base}${SECRET_ENV_KEY}="${secret}"\n`;
  }
  writeFileSync(envFile, content, "utf8");
}
