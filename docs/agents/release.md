# Release & Tegami

All `@dimah-s3/*` published packages version **together** (`group: dimah-s3` with `syncBump` / `syncGitTag` in `scripts/tegami.mts`). Private apps, examples, and `@workspace/*` tooling are ignored and must not join the publish graph.

## Release lines

`scripts/tegami.mts` is the same file on every release branch. It picks the line from `RELEASE_BRANCH`, then `GITHUB_BASE_REF`, then `GITHUB_REF_NAME`. Publish sets `RELEASE_BRANCH` because a `workflow_run` keeps `GITHUB_REF` on the default branch.

| Branch | Versions       | npm dist-tag | Install                      | Docs                                            |
| ------ | -------------- | ------------ | ---------------------------- | ----------------------------------------------- |
| `main` | 1.x            | `latest`     | `npm i @dimah-s3/react`      | [v1.s3.dimah.dev](https://v1.s3.dimah.dev/docs) |
| `v2`   | `2.0.0-beta.N` | `beta`       | `npm i @dimah-s3/react@beta` | [s3.dimah.dev](https://s3.dimah.dev/docs)       |

Only `main` may use the `latest` dist-tag. While `v2` is a beta, every bump advances `2.0.0-beta.N` and can include breaking changes. The first changelog that enters that line must be `major`, so the version is `2.0.0-beta.0` rather than `1.8.0-beta.0`. Install a beta with the dist-tag or an exact version. A caret range on a prerelease does not track the line.

Feature work for 2.0 branches from `v2` and merges back there. 1.x fixes branch from `main`. Cherry-pick the change and its `.tegami` file onto the other line when both need it. Never cherry-pick a Version Packages commit (`package.json` versions, `CHANGELOG.md`, and `.tegami/publish-lock.yaml` belong to one line).

When 2.0.0 is ready, merge `v2` into `main`. `main` has no `prerelease`, so the next publish drops the suffix and moves `latest` to `2.0.0`. Before that merge, cut `v1` from the last 1.x commit, add `v1: { distTag: "v1" }` to `lines`, and add `v1` to the CI and Publish branch lists. `s3.dimah.dev` already serves the `v2` line and `v1.s3.dimah.dev` serves `main`. After the merge, point `s3.dimah.dev` at `main` and `v1.s3.dimah.dev` at the `v1` branch. See [Multiple Release Lines](https://tegami.fuma-nama.dev/multi-version).

Docs for this line deploy from the `dimah-s3-docs-v2` Vercel project. `s3.dimah.dev` is the canonical origin. `v2.s3.dimah.dev` redirects there. 1.x docs deploy from `dimah-s3-docs` at `v1.s3.dimah.dev`. The app treats `VERCEL_ENV=production` or `VERCEL_GIT_COMMIT_REF=v2` as `https://s3.dimah.dev`, including when Vercel marks the `v2` deployment as Preview.

Prose: [changelog.md](./changelog.md). File format: [Tegami changelogs](https://tegami.fuma-nama.dev/changelog). Do not edit `.tegami/publish-lock.yaml` or package `CHANGELOG.md` files directly.

## When to add a changelog

Add one when any published package changes **behavior, public API, or build output**:

```bash
pnpm tegami
```

Or write a Markdown file under `.tegami/` as `YYYY-MM-DD-{hash}.md`. Prefer `group:dimah-s3` when the whole line should bump.

Skip for repo-only docs, CI/config, or typos with no package output impact. How to write the file: [changelog.md](./changelog.md).

Package references: `"@dimah-s3/core"`, `"npm:@dimah-s3/core"`, or `"group:dimah-s3"` (preferred for line-wide bumps).

## Bump types

| Type  | When                                      |
| ----- | ----------------------------------------- |
| patch | Fix, internal-safe improvement            |
| minor | Backward-compatible feature               |
| major | Breaking API, types, or consumer contract |

The maintainer picks the bump. On `main`, a breaking change is a `major`. On `v2`, the version stays `2.0.0-beta.N` after the line has started, including when a changelog is `major`. A breaking change is never silent: [changelog.md](./changelog.md).

- Write one file per changed package (`"@dimah-s3/<pkg>": minor`), plus one `group:dimah-s3` file with the upgrade overview when the whole line moves.
- Add or update the docs upgrade page (`apps/docs/content/docs/(framework)/migration-<version>.mdx`) and link it from the group file.

## Exact peers

`@dimah-s3/ui` pins `@dimah-s3/core` and `@dimah-s3/react`, and `@dimah-s3/db` pins `@dimah-s3/server`, to the exact current version (such as `"1.7.1"` or `"2.0.0-beta.0"`, not a range). The Tegami version step rewrites them with the group bump. `pnpm check:dist` fails when an exact `@dimah-s3/*` peer differs from that package's version.

## Before opening a PR

```bash
pnpm build
pnpm check-types
pnpm test
pnpm check:dist
```

When changing `templates/**` or template maintenance scripts, also run `pnpm templates:build`. Before the new version is on npm, use `pnpm templates:build -- --local`, which packs the workspace packages instead.

CI posts a Tegami release preview comment on the PR. `pnpm tegami pr preview --number <pr> --artifact <file>` builds the same preview locally; it reads the pull request from GitHub, so it needs one.

## Maintainer publish flow

After PRs with pending changelogs merge to the release branch (`main` or `v2`):

1. The Publish workflow runs `pnpm tegami ci`, writes `.tegami/publish-lock.yaml`, and opens a **Version Packages** PR.
2. Review and merge that PR (bumped versions + lock + changelogs).
3. The next Publish run publishes to npm, creates the shared git tag (`dimah-s3@x.y.z`), and a GitHub release.

Failed publishes are safe to retry — the publish lock lives in git.

### npm Trusted Publishers (OIDC)

Each published `@dimah-s3/*` package needs a [Trusted Publisher](https://docs.npmjs.com/trusted-publishers/) on npmjs.com (Package → Settings → Trusted Publisher):

- **Organization or user:** `dimah-kz`
- **Repository:** `dimah-s3`
- **Workflow filename:** `publish.yml`

Configure this for every new package under the scope (after the package exists on npm). Missing config makes OIDC token exchange fail with 404.

## Local commands

| Command                  | Purpose                                |
| ------------------------ | -------------------------------------- |
| `pnpm tegami`            | Create a changelog interactively       |
| `pnpm tegami pr preview` | Preview the release for a pull request |
| `pnpm tegami version`    | Draft bumps and write the publish lock |
| `pnpm tegami publish`    | Publish from the publish lock          |
| `pnpm tegami ci`         | Version if pending, otherwise publish  |
