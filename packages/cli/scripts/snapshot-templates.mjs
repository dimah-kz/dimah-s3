/**
 * Snapshot `templates/<id>/` into `dist/templates/<id>/` for the published CLI.
 *
 * - Rewrites `@dimah-s3/*` to `^<cliVersion>` (sync-bump aligned)
 * - Renames `.gitignore` → `_gitignore` (npm strips `.gitignore` from tarballs)
 * - Fails on `workspace:` / `catalog:` / `@workspace/` leaks
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageRoot = resolve(__dirname, "..");
const workspaceRoot = resolve(packageRoot, "..", "..");
const templatesRoot = resolve(workspaceRoot, "templates");
const catalogPath = resolve(templatesRoot, "catalog.json");
const distTemplatesRoot = resolve(packageRoot, "dist", "templates");
const cliPackageJsonPath = resolve(packageRoot, "package.json");
const transformModuleUrl = pathToFileURL(
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
]);

/**
 * @param {string} src
 * @param {string} dest
 * @param {(name: string) => boolean} shouldSkip
 */
function copyDirFiltered(src, dest, shouldSkip) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (shouldSkip(entry)) continue;
    const from = join(src, entry);
    const to = join(dest, entry);
    const stats = statSync(from);
    if (stats.isDirectory()) {
      copyDirFiltered(from, to, shouldSkip);
      continue;
    }
    if (entry.endsWith(".tsbuildinfo")) continue;
    cpSync(from, to);
  }
}

/**
 * @param {string} templateDir
 */
function renameGitignore(templateDir) {
  const gitignore = join(templateDir, ".gitignore");
  const underscored = join(templateDir, "_gitignore");
  if (existsSync(gitignore)) {
    renameSync(gitignore, underscored);
  }
}

/**
 * @param {string} templateDir
 * @param {string} cliVersion
 * @param {{ transformTemplatePackageJson: Function }} transform
 */
function transformPackageJsonFile(templateDir, cliVersion, transform) {
  const pkgPath = join(templateDir, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`Missing package.json in ${templateDir}`);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const { pkg: next, warnings } = transform.transformTemplatePackageJson(pkg, {
    cliVersion,
  });
  for (const warning of warnings) {
    console.warn(`[snapshot] ${warning}`);
  }
  writeFileSync(pkgPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function snapshotTemplates() {
  if (!existsSync(catalogPath)) {
    throw new Error(`Missing templates catalog at ${catalogPath}`);
  }

  const transform = await import(transformModuleUrl);

  const catalogJson = JSON.parse(readFileSync(catalogPath, "utf8"));
  const templates = catalogJson.templates;
  if (!Array.isArray(templates) || templates.length === 0) {
    throw new Error("templates/catalog.json must list at least one template");
  }

  const cliPkg = JSON.parse(readFileSync(cliPackageJsonPath, "utf8"));
  const cliVersion = cliPkg.version;
  if (typeof cliVersion !== "string" || !cliVersion) {
    throw new Error("CLI package.json is missing version");
  }

  rmSync(distTemplatesRoot, { recursive: true, force: true });
  mkdirSync(distTemplatesRoot, { recursive: true });

  for (const entry of templates) {
    const id = entry?.id;
    if (typeof id !== "string" || !id) {
      throw new Error("Each catalog entry needs a string id");
    }
    if (typeof entry.title !== "string" || !entry.title) {
      throw new Error(`Catalog entry "${id}" needs a string title`);
    }
    const src = resolve(templatesRoot, id);
    if (!existsSync(src)) {
      throw new Error(`Template folder missing: ${src}`);
    }
    const dest = resolve(distTemplatesRoot, id);
    copyDirFiltered(src, dest, (name) => COPY_EXCLUDE.has(name));
    renameGitignore(dest);
    transformPackageJsonFile(dest, cliVersion, transform);
    console.log(`[snapshot] ${id} → dist/templates/${id}`);
  }

  writeFileSync(
    join(distTemplatesRoot, "catalog.json"),
    `${JSON.stringify(catalogJson, null, 2)}\n`,
    "utf8",
  );
  console.log("[snapshot] wrote dist/templates/catalog.json");
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  await snapshotTemplates();
}
