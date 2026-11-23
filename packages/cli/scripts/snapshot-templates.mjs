/**
 * Snapshot `templates/<id>/` into `dist/templates/<id>/` for the published CLI.
 *
 * Pins `@dimah-s3/*` to `^<cliVersion>` (exact version on a prerelease),
 * renames `.gitignore` → `_gitignore`,
 * fails on workspace/catalog leaks. Local env files (`.env`, `.env.local`, …)
 * are never copied, and `.env.example` must list an empty `DIMAH_S3_SECRET`.
 * A starter's `.gitignore` must not ignore a lockfile: the app commits its own.
 *
 * The transform is imported as TypeScript source (Node strips the types),
 * so it is never part of the published `dist`.
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
import { fileURLToPath } from "node:url";
import {
  assertEnvExampleSecret,
  assertLockfilesNotIgnored,
  catalogPath,
  copyTemplateDir,
  listCatalogEntries,
  templateDir,
} from "../../../scripts/templates-shared.mjs";
import { transformTemplatePackageJson } from "../src/snapshot/transform.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(packageRoot, "dist", "templates");

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
  assertLockfilesNotIgnored(source);
  const dest = resolve(distRoot, id);
  copyTemplateDir(source, dest);

  const gitignore = join(dest, ".gitignore");
  if (existsSync(gitignore)) {
    renameSync(gitignore, join(dest, "_gitignore"));
  }

  const pkgPath = join(dest, "package.json");
  const { pkg, warnings } = transformTemplatePackageJson(
    JSON.parse(readFileSync(pkgPath, "utf8")),
    { cliVersion },
  );
  for (const warning of warnings) console.warn(`[snapshot] ${warning}`);
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  console.log(`[snapshot] ${id} → dist/templates/${id}`);
}

cpSync(catalogPath, join(distRoot, "catalog.json"));
console.log("[snapshot] wrote dist/templates/catalog.json");
