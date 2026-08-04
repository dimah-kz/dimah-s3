import { execFileSync } from "node:child_process";
import { tegami, type TegamiPlugin } from "tegami";
import { runCli } from "tegami/cli";
import { github } from "tegami/plugins/github";

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
    },
  },
  // Ignored private packages are excluded from the graph; everything left
  // is the published `@dimah-s3/*` line and shares one release group.
  packages: () => ({ group: "dimah-s3" }),
  ignore: [
    "dimah-s3",
    "docs",
    "@dimah-s3/registry",
    "@dimah-s3/example-with-db",
    "@dimah-s3/example-with-nextjs",
    "@workspace/eslint-config",
    "@workspace/typescript-config",
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
      repo: "hamidrezakz/dimah-s3",
      versionPr: {
        base: "main",
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
