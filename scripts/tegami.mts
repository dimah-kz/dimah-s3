import { execFileSync, execSync } from "node:child_process";
import { relative } from "node:path";
import {
  tegami,
  type ChangelogEntry,
  type TegamiPlugin,
  type WorkspacePackage,
} from "tegami";
import { runCli } from "tegami/cli";
import { github } from "tegami/plugins/github";

/**
 * Release lines by branch. `main` is the only one: it publishes every
 * `@dimah-s3/*` package on the `latest` dist-tag. A prerelease line for a
 * future major would add its branch here with a `prerelease` identifier and a
 * dist-tag other than `latest`, and the same branch to `ci.yml`,
 * `publish.yml`, and `tegami-pr.yml`. Steps: docs/agents/release.md.
 */
interface ReleaseLine {
  /** npm dist-tag. Only `main` may claim `latest`. */
  distTag: string;
  /** Prerelease identifier. Omitted on stable lines. */
  prerelease?: string;
}

const lines: Record<string, ReleaseLine> = {
  main: { distTag: "latest" },
};

const repo = "dimah-kz/dimah-s3";

/**
 * GitHub refuses a pull request body over 65,536 characters and a release
 * body over 125,000. Above these estimates the version pull request and the
 * GitHub release list each changelog by title and link the package
 * `CHANGELOG.md` files, which keep every note.
 */
const VERSION_PR_BUDGET = 60_000;
const RELEASE_BUDGET = 120_000;

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
      // One command string: `pnpm` is a `.cmd` shim on Windows and needs
      // the shell, and an argument array with a shell is deprecated in Node.
      // `pkg.name` is a workspace package name.
      execSync(`pnpm exec turbo run build --filter ${pkg.name}`, {
        cwd: this.cwd,
        stdio: "inherit",
      });
    },
  };
}

/** Each changelog once, in the order the packages list them. */
function uniqueEntries(
  lists: Iterable<readonly ChangelogEntry[] | undefined>,
): ChangelogEntry[] {
  const entries = new Map<string, ChangelogEntry>();
  for (const list of lists) {
    for (const entry of list ?? []) entries.set(entry.id, entry);
  }
  return [...entries.values()];
}

/** Rough size of the notes Tegami renders, with room for its tables. */
function estimateNotes(entries: readonly ChangelogEntry[]): number {
  let size = 0;
  for (const entry of entries) {
    size += 500;
    for (const section of entry.sections) {
      size += section.title.length + section.content.length + 8;
    }
  }
  return size;
}

/** `- Title` for each changelog, without its body. */
function listTitles(entries: readonly ChangelogEntry[]): string {
  return entries
    .map((entry) => {
      const title =
        entry.sections.find((section) => section.depth <= 3)?.title ??
        entry.subject ??
        entry.filename;
      return `- ${title}`;
    })
    .join("\n");
}

/** Link to a package's `CHANGELOG.md` at `ref`. */
function changelogLink(cwd: string, pkg: WorkspacePackage, ref: string) {
  const dir = relative(cwd, pkg.path).replaceAll("\\", "/");
  return `[\`${pkg.name}\`](https://github.com/${repo}/blob/${ref}/${dir}/CHANGELOG.md)`;
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
      repo,
      release: {
        createGrouped({ tag, packages, plan }) {
          const entries = uniqueEntries(
            packages.map((pkg) => plan.packages.get(pkg.id)?.changelogs),
          );
          if (estimateNotes(entries) <= RELEASE_BUDGET) return {};

          return {
            notes: [
              packages.map((pkg) => `- ${pkg.name}@${pkg.version}`).join("\n"),
              "",
              "## Changes",
              "",
              listTitles(entries),
              "",
              "## Changelogs",
              "",
              "Every change, with its breaking changes and upgrade steps:",
              "",
              packages
                .map((pkg) => `- ${changelogLink(this.cwd, pkg, tag)}`)
                .join("\n"),
            ].join("\n"),
          };
        },
      },
      versionPr: {
        base: branch,
        // A slash would collide with publish-group refs (`tegami/version-packages`).
        branch: `tegami-version-packages-${branch}`,
        create({ draft, getPreviousVersion }) {
          const version = this.graph.get("npm:@dimah-s3/core")?.version;
          const title = version
            ? `chore: version packages (${version})`
            : "chore: version packages";

          const drafts = draft.getPackageDrafts();
          const entries = uniqueEntries(
            [...drafts.values()].map((pkg) => pkg.changelogs),
          );
          if (estimateNotes(entries) <= VERSION_PR_BUDGET) return { title };

          const rows: string[] = [];
          for (const id of drafts.keys()) {
            const pkg = this.graph.get(id);
            const from = getPreviousVersion(id);
            if (!pkg?.version || !from || from === pkg.version) continue;
            rows.push(`| \`${pkg.name}\` | \`${from}\` | \`${pkg.version}\` |`);
          }

          return {
            title,
            body: [
              "## Summary",
              "",
              "| Package | From | To |",
              "| --- | --- | --- |",
              ...rows.sort(),
              "",
              "## Changelogs",
              "",
              "The notes are too long for a pull request body. Each package's `CHANGELOG.md` in this pull request has all of them.",
              "",
              listTitles(entries),
              "",
            ].join("\n"),
          };
        },
      },
    }),
  ],
});

await runCli(paper);
