import { execFileSync } from "node:child_process";
import { tegami, type TegamiPlugin } from "tegami";
import { runCli } from "tegami/cli";
import { github } from "tegami/plugins/github";

/**
 * One file on every release branch. `main` is stable 1.x (`latest`).
 * `v2` is the 2.0 beta (`2.0.0-beta.N` on the `beta` dist-tag).
 * When 2.0.0 ships, drop `v2` after merging it into `main`, and add a
 * `v1` maintenance line with `distTag: "v1"` cut from the last 1.x commit.
 */
interface ReleaseLine {
  /** npm dist-tag. Only `main` may claim `latest`. */
  distTag: string;
  /** Prerelease identifier. Omitted on stable lines. */
  prerelease?: string;
}

const lines: Record<string, ReleaseLine> = {
  main: { distTag: "latest" },
  v2: { distTag: "beta", prerelease: "beta" },
};

function releaseBranch(): string {
  // Publish runs via workflow_run, whose GITHUB_REF stays on the default
  // branch. The workflow sets RELEASE_BRANCH from the branch that CI built.
  const configured = process.env.RELEASE_BRANCH?.trim();
  if (configured) return configured;
  // pull_request checks out a merge ref, so the line is the PR base.
  const base = process.env.GITHUB_BASE_REF?.trim();
  if (base) return base;
  const refName = process.env.GITHUB_REF_NAME?.trim();
  if (refName && refName !== "HEAD") return refName;

  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

const command = process.argv[2] ?? "";
const branch = releaseBranch();
const line = lines[branch];

if (
  !line &&
  (command === "ci" || command === "version" || command === "publish")
) {
  throw new Error(
    `"${branch}" is not a release line. Add it to \`lines\` in scripts/tegami.mts.`,
  );
}

const active: ReleaseLine = line ?? { distTag: "latest" };

/** Build each package (and its deps) via Turbo right before npm publish. */
function buildOnPublish(): TegamiPlugin {
  return {
    name: "build-on-publish",
    async willPublish({ pkg }) {
      execFileSync(
        "pnpm",
        ["exec", "turbo", "run", "build", "--filter", pkg.name],
        {
          cwd: this.cwd,
          stdio: "inherit",
          shell: true,
        },
      );
    },
  };
}

const paper = tegami({
  groups: {
    "dimah-s3": {
      syncBump: true,
      syncGitTag: true,
      prerelease: active.prerelease,
      npm: { distTag: active.distTag },
    },
  },
  // Ignored private packages are excluded from the graph; everything left
  // is the published `@dimah-s3/*` line and shares one release group.
  packages: () => ({ group: "dimah-s3" }),
  ignore: [
    "dimah-s3",
    "docs",
    "brand",
    "@dimah-s3/registry",
    /^@dimah-s3\/example-/,
    /^@workspace\//,
  ],
  npm: {
    client: "pnpm",
    updateLockFile: true,
    // Fixed group already sync-bumps every published package; private apps /
    // examples stay on workspace: ranges and should not get version bumps.
    bumpDep: () => false,
    trustedPublish: {
      provider: "github",
      workflow: "publish.yml",
    },
  },
  plugins: [
    buildOnPublish(),
    github({
      repo: "dimah-kz/dimah-s3",
      versionPr: {
        base: branch,
        // A slash would collide with publish-group refs (`tegami/version-packages`).
        branch: `tegami-version-packages-${branch}`,
        create() {
          const version = this.graph.get("npm:@dimah-s3/core")?.version;
          return {
            title: version
              ? `chore: version packages (${version})`
              : "chore: version packages",
          };
        },
      },
    }),
  ],
});

await runCli(paper);
