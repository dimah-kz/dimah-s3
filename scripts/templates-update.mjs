/**
 * `pnpm update --latest` in each standalone `templates/<id>/`.
 *
 * `latest` is the 1.x line, so an exact `2.0.0-beta.N` pin never moves.
 * When this checkout's CLI is a prerelease, `@dimah-s3/*` is then set to the
 * exact version of the npm `beta` dist-tag (the same version on every
 * package). The CLI snapshot still rewrites those pins to the CLI version
 * at build time. The Next.js starter's `typescript` is put back to
 * `^6.0.2`: `pnpm update --latest` moves it to TypeScript 7, and
 * typescript-eslint (via `eslint-config-next`) cannot lint that yet.
 *
 *   pnpm templates:update
 *   pnpm templates:update -- nextjs vite
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  assertConcreteNpmRanges,
  repoRoot,
  resolveTemplateIds,
  run,
  templateDir,
} from "./templates-shared.mjs";

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const SCOPE = "@dimah-s3/";
/**
 * typescript-eslint 8 accepts `typescript` `<6.1.0` and does not support
 * TypeScript 7. Only the Next.js starter lints.
 */
const NEXTJS_TYPESCRIPT = "^6.0.2";
/** Packages that share the `beta` dist-tag. A mismatch means a partial publish. */
const BETA_PACKAGES = [
  "@dimah-s3/core",
  "@dimah-s3/server",
  "@dimah-s3/react",
  "@dimah-s3/ui",
];

const ids = resolveTemplateIds();
const cliVersion = JSON.parse(
  readFileSync(resolve(repoRoot, "packages/cli/package.json"), "utf8"),
).version;
const betaVersion = String(cliVersion).includes("-")
  ? publishedBetaVersion()
  : null;

if (betaVersion) {
  console.log(
    `[pin] prerelease CLI ${cliVersion}; @dimah-s3/* → npm beta ${betaVersion}`,
  );
}

for (const id of ids) {
  const dir = templateDir(id);
  console.log(`\n=== update templates/${id} ===`);
  run("pnpm", ["update", "--latest"], dir);
  if (betaVersion) pinDimahPackages(dir, betaVersion);
  if (id === "nextjs") pinDependency(dir, "typescript", NEXTJS_TYPESCRIPT);
  assertConcreteNpmRanges(dir);
  console.log(`[ok] templates/${id}`);
}

console.log(`\nUpdated ${ids.length} template(s): ${ids.join(", ")}`);

/**
 * Exact version behind the npm `beta` tag. Every synced package must match.
 * @returns {string}
 */
function publishedBetaVersion() {
  const versions = BETA_PACKAGES.map((name) => ({
    name,
    version: npmViewVersion(`${name}@beta`),
  }));
  const version = versions[0]?.version;
  if (!version || versions.some((entry) => entry.version !== version)) {
    const listed = versions
      .map((entry) => `${entry.name}@${entry.version}`)
      .join(", ");
    throw new Error(
      `npm beta dist-tag is not the same version on every @dimah-s3 package (${listed})`,
    );
  }
  return version;
}

/**
 * Writes `version` into every `@dimah-s3/*` range. Leaves other deps and
 * formatting alone.
 * @param {string} dir
 * @param {string} version
 */
function pinDimahPackages(dir, version) {
  const path = resolve(dir, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (name.startsWith(SCOPE)) pinDependency(dir, name, version);
    }
  }
}

/**
 * @param {string} dir
 * @param {string} name package name as it appears in package.json
 * @param {string} version
 */
function pinDependency(dir, name, version) {
  const path = resolve(dir, "package.json");
  const original = readFileSync(path, "utf8");
  const pattern = new RegExp(
    `("${name.replaceAll("/", "\\/")}":\\s*")[^"]+(")`,
    "g",
  );
  const next = original.replace(pattern, (_, head, tail) => {
    return `${head}${version}${tail}`;
  });
  if (next !== original) writeFileSync(path, next, "utf8");
}

/**
 * @param {string} spec npm package spec, such as `@dimah-s3/core@beta`
 * @returns {string}
 */
function npmViewVersion(spec) {
  const args = ["view", spec, "version"];
  const result =
    process.platform === "win32"
      ? spawnSync(["npm", ...args].join(" "), {
          encoding: "utf8",
          shell: true,
          env: process.env,
        })
      : spawnSync("npm", args, { encoding: "utf8", env: process.env });

  if (result.error) throw result.error;
  const version = (result.stdout ?? "").trim();
  if (result.status !== 0 || !version) {
    throw new Error(
      `npm view ${spec} version failed (${result.status}): ${(result.stderr ?? "").trim()}`,
    );
  }
  return version;
}
