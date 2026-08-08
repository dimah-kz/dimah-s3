/**
 * Snapshot `templates/<id>/` into `dist/templates/<id>/` for the published CLI.
 *
 * Pins `@dimah-s3/*` to `^<cliVersion>`, renames `.gitignore` → `_gitignore`,
 * fails on workspace/catalog leaks.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  catalogPath,
  listCatalogEntries,
  templateDir,
} from "../../../scripts/templates-shared.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(packageRoot, "dist", "templates");
const transformUrl = pathToFileURL(
  resolve(packageRoot, "dist", "snapshot", "transform.js"),
).href;

const COPY_EXCLUDE = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "AGENTS.md",
  "dist",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  ".env",
  ".env.local",
  "next-env.d.ts",
  ".vercel",
  ".DS_Store",
  ".git",
]);

function copyDirFiltered(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (COPY_EXCLUDE.has(entry)) continue;
    const from = join(src, entry);
    const to = join(dest, entry);
    if (statSync(from).isDirectory()) {
      copyDirFiltered(from, to);
      continue;
    }
    if (entry.endsWith(".tsbuildinfo")) continue;
    cpSync(from, to);
  }
}

const transform = await import(transformUrl);
const cliVersion = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
).version;
if (typeof cliVersion !== "string" || !cliVersion) {
  throw new Error("CLI package.json is missing version");
}

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(distRoot, { recursive: true });

for (const { id } of listCatalogEntries()) {
  const dest = resolve(distRoot, id);
  copyDirFiltered(templateDir(id), dest);

  const gitignore = join(dest, ".gitignore");
  if (existsSync(gitignore)) {
    renameSync(gitignore, join(dest, "_gitignore"));
  }

  const pkgPath = join(dest, "package.json");
  const { pkg, warnings } = transform.transformTemplatePackageJson(
    JSON.parse(readFileSync(pkgPath, "utf8")),
    { cliVersion },
  );
  for (const warning of warnings) console.warn(`[snapshot] ${warning}`);
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  console.log(`[snapshot] ${id} → dist/templates/${id}`);
}

cpSync(catalogPath, join(distRoot, "catalog.json"));
console.log("[snapshot] wrote dist/templates/catalog.json");
