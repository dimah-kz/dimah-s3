/**
 * Smoke-install + build (+ check-types, + lint when defined) each standalone
 * `templates/<id>/`.
 *
 *   pnpm templates:build                    # published @dimah-s3/* from npm
 *   pnpm templates:build -- nextjs
 *   pnpm templates:build -- --local         # workspace packages, before publish
 *   pnpm templates:build -- --local vite
 *
 * `--local` packs the workspace `@dimah-s3/*` packages (their current `dist`,
 * so run `pnpm build` first), copies each template to a temp folder, and
 * points every `@dimah-s3/*` dependency at the tarballs. `templates/` is not
 * touched. The copy is removed on success and kept on failure.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DEV_SECRET,
  SECRET_ENV_KEY,
  assertConcreteNpmRanges,
  assertEnvExampleSecret,
  copyTemplateDir,
  repoRoot,
  resolveTemplateIds,
  run,
  templateDir,
  writeSmokeEnv,
} from "./templates-shared.mjs";

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const SCOPE = "@dimah-s3/";
/** Tarballs inside each template copy, referenced by relative `file:` specs. */
const LOCAL_PACKAGES_DIR = ".local-packages";

const local = process.argv.includes("--local");
const ids = resolveTemplateIds();

// Next.js collects the S3 route module at build time, which constructs
// `dimahS3()` and requires a bucket. Smoke builds have no real credentials.
process.env.S3_BUCKET ??= "your-bucket-name";
process.env.S3_REGION ??= "auto";
process.env.S3_ENDPOINT ??= "https://your-endpoint.example.com";
process.env.S3_ACCESS_KEY_ID ??= "your-access-key-id";
process.env.S3_SECRET_ACCESS_KEY ??= "your-secret-access-key";
// Templates pass `secret: process.env.DIMAH_S3_SECRET`, which must have at
// least 32 characters when set.
process.env[SECRET_ENV_KEY] ||= DEV_SECRET;

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** @returns {Map<string, { dir: string, pkg: Record<string, any> }>} */
function workspacePackages() {
  const packagesRoot = join(repoRoot, "packages");
  const found = new Map();
  for (const entry of readdirSync(packagesRoot)) {
    const manifest = join(packagesRoot, entry, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = readJson(manifest);
    if (typeof pkg.name === "string" && pkg.name.startsWith(SCOPE)) {
      found.set(pkg.name, { dir: join(packagesRoot, entry), pkg });
    }
  }
  return found;
}

/** @param {Record<string, any>} pkg */
function scopedDeps(pkg) {
  const names = new Set();
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (name.startsWith(SCOPE)) names.add(name);
    }
  }
  return names;
}

/**
 * The `@dimah-s3/*` packages the templates use, plus the workspace packages
 * they depend on (`server` → `core`).
 * @param {Map<string, { dir: string, pkg: Record<string, any> }>} workspace
 */
function packagesToPack(workspace) {
  const pending = ids.flatMap((id) => [
    ...scopedDeps(readJson(join(templateDir(id), "package.json"))),
  ]);
  const names = new Set();
  while (pending.length > 0) {
    const name = pending.pop();
    if (names.has(name)) continue;
    const entry = workspace.get(name);
    if (!entry) {
      throw new Error(`${name} is not a workspace package under packages/`);
    }
    names.add(name);
    pending.push(...scopedDeps(entry.pkg));
  }
  return [...names].sort();
}

/**
 * Packs each package into its own folder under `outDir`.
 * @returns {Map<string, string>} package name → tarball path
 */
function packWorkspacePackages(outDir) {
  const workspace = workspacePackages();
  const tarballs = new Map();
  for (const name of packagesToPack(workspace)) {
    const { dir, pkg } = /** @type {{ dir: string, pkg: any }} */ (
      workspace.get(name)
    );
    if (!existsSync(join(dir, "dist"))) {
      throw new Error(`${name} has no dist/. Run \`pnpm build\` first.`);
    }
    const dest = join(outDir, name.slice(SCOPE.length));
    mkdirSync(dest, { recursive: true });
    run("pnpm", ["pack", "--pack-destination", dest], dir);
    const tarball = readdirSync(dest).find((file) => file.endsWith(".tgz"));
    if (!tarball) throw new Error(`pnpm pack wrote no tarball for ${name}`);
    tarballs.set(name, join(dest, tarball));
    console.log(`[local] ${name}@${pkg.version} → ${tarball}`);
  }
  return tarballs;
}

/**
 * Points every `@dimah-s3/*` dependency of the copy at a tarball, direct and
 * transitive (pnpm `overrides`). ui's `@dimah-s3/*` peers are exact versions
 * that the workspace tarballs satisfy.
 * @param {string} dir
 * @param {Map<string, string>} tarballs
 */
function linkTarballs(dir, tarballs) {
  const localDir = join(dir, LOCAL_PACKAGES_DIR);
  mkdirSync(localDir, { recursive: true });
  /** @type {Map<string, string>} */
  const specs = new Map();
  for (const [name, tarball] of tarballs) {
    const file = `${name.slice(SCOPE.length)}.tgz`;
    copyFileSync(tarball, join(localDir, file));
    specs.set(name, `file:./${LOCAL_PACKAGES_DIR}/${file}`);
  }

  const pkgPath = join(dir, "package.json");
  const pkg = readJson(pkgPath);
  for (const field of ["dependencies", "devDependencies"]) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      const spec = specs.get(name);
      if (spec) pkg[field][name] = spec;
    }
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  const workspacePath = join(dir, "pnpm-workspace.yaml");
  const existing = existsSync(workspacePath)
    ? readFileSync(workspacePath, "utf8")
    : "";
  if (/^overrides:/m.test(existing)) {
    throw new Error(`${workspacePath} already has overrides; merge them here`);
  }
  const overrides = [...specs]
    .map(([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`)
    .join("\n");
  const base =
    existing === "" || existing.endsWith("\n") ? existing : `${existing}\n`;
  writeFileSync(
    workspacePath,
    `${base}# templates:build --local: workspace tarballs.\noverrides:\n${overrides}\n`,
    "utf8",
  );
}

/** @param {string} dir */
function buildTemplate(dir, installArgs = []) {
  run("pnpm", ["install", ...installArgs], dir);
  run("pnpm", ["run", "build"], dir);
  run("pnpm", ["run", "check-types"], dir);
  // Scaffolded apps get the template's lint script, so it must pass too.
  if (readJson(join(dir, "package.json")).scripts?.lint) {
    run("pnpm", ["run", "lint"], dir);
  }
}

let tarballs;
let localRoot;
if (local) {
  localRoot = join(tmpdir(), "dimah-s3-templates-local");
  rmSync(localRoot, { recursive: true, force: true });
  tarballs = packWorkspacePackages(join(localRoot, ".packages"));
}

for (const id of ids) {
  const source = templateDir(id);
  console.log(`\n=== build templates/${id}${local ? " (--local)" : ""} ===`);
  assertConcreteNpmRanges(source);
  assertEnvExampleSecret(source);

  if (!local) {
    writeSmokeEnv(source);
    buildTemplate(source);
    console.log(`[ok] templates/${id}`);
    continue;
  }

  const dir = resolve(/** @type {string} */ (localRoot), id);
  copyTemplateDir(source, dir);
  linkTarballs(dir, /** @type {Map<string, string>} */ (tarballs));
  writeSmokeEnv(dir);
  try {
    // No lockfile in the copy, so never install frozen (CI defaults to it).
    buildTemplate(dir, ["--no-frozen-lockfile"]);
  } catch (error) {
    console.error(`\n[local] kept ${dir} for debugging`);
    throw error;
  }
  rmSync(dir, { recursive: true, force: true });
  console.log(`[ok] templates/${id} (local packages)`);
}

if (localRoot) rmSync(localRoot, { recursive: true, force: true });
console.log(
  `\nBuilt ${ids.length} template(s)${local ? " against workspace packages" : ""}: ${ids.join(", ")}`,
);
