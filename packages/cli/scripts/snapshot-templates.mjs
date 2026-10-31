/**
 * Snapshot `templates/<id>/` into `dist/templates/<id>/` for the published CLI.
 *
 * Pins `@dimah-s3/*` to `^<cliVersion>`, renames `.gitignore` → `_gitignore`,
 * fails on workspace/catalog leaks. Local env files (`.env`, `.env.local`, …)
 * are never copied, and `.env.example` must list an empty `DIMAH_S3_SECRET`.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertEnvExampleSecret,
  catalogPath,
  copyTemplateDir,
  listCatalogEntries,
  templateDir,
} from "../../../scripts/templates-shared.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(packageRoot, "dist", "templates");
const transformUrl = pathToFileURL(
  resolve(packageRoot, "dist", "snapshot", "transform.js"),
).href;

/** Scaffolded projects do not get the starter's AGENTS.md. */
const SNAPSHOT_EXCLUDE = ["AGENTS.md"];

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
  const source = templateDir(id);
  // `create` fills DIMAH_S3_SECRET in `.env` from this line.
  assertEnvExampleSecret(source);
  const dest = resolve(distRoot, id);
  copyTemplateDir(source, dest, { exclude: SNAPSHOT_EXCLUDE });

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
