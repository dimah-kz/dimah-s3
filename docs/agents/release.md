# Release & Tegami

All `@dimah-s3/*` published packages version **together** (`group: dimah-s3` with `syncBump` / `syncGitTag` in `scripts/tegami.mts`). Private apps, examples, and `@workspace/*` tooling are ignored and must not join the publish graph.

## Release line

`main` is the only release line. Every version publishes on the npm `latest` dist-tag (`npm i @dimah-s3/react`), and the docs at [s3.dimah.dev](https://s3.dimah.dev/docs) deploy from `main`. Feature work and fixes branch from `main` and squash-merge back into it.

`scripts/tegami.mts` picks the line from `RELEASE_BRANCH`, then `GITHUB_BASE_REF`, then `GITHUB_REF_NAME`, and refuses to version or publish on a branch missing from `lines`. Publish sets `RELEASE_BRANCH` because a `workflow_run` keeps `GITHUB_REF` on the default branch, and `workflow_run` always runs the `publish.yml` on the default branch.

### 1.x

1.x is no longer maintained. The `v1` branch is a read-only archive of the last 1.x commit (`1.7.2`), locked by the `Archive v1` ruleset. It is not a release line: CI does not run on it and nothing publishes from it. Do not cherry-pick fixes onto it. Its docs deploy from `v1` in the `dimah-s3-docs` Vercel project at [v1.s3.dimah.dev](https://v1.s3.dimah.dev/docs).

### Docs deploys

`s3.dimah.dev` deploys from `main` in the `dimah-s3-docs-v2` Vercel project and is the canonical origin. `v2.s3.dimah.dev` redirects there. The app treats `VERCEL_ENV=production` or `VERCEL_GIT_COMMIT_REF=main` as `https://s3.dimah.dev`.

### A prerelease line

A beta for a future major runs on its own branch:

1. Cut the branch from `main`. Add it to `lines` in `scripts/tegami.mts` with a `prerelease` identifier and a dist-tag other than `latest`. The tag cannot parse as a semver range (npm refuses `v3`, and `npm i pkg@v3` would resolve as the range): use `beta` or `next`.
2. Add the branch to `ci.yml` and `tegami-pr.yml`, and to `publish.yml` on `main` (the trigger and the `if`), since that is the copy that runs. Give it a ruleset that requires **CI passed**.
3. The first changelog that enters the line must be `major`, so the version is `3.0.0-beta.0` rather than `2.x.0-beta.0`. Every later bump stays `3.0.0-beta.N`, including breaking changes. A caret range on a prerelease does not track the line; install it with the dist-tag or an exact version.
4. To ship, merge the branch into `main` (`git merge -s ours origin/main` on a branch from it when `main` has Version Packages commits it lacks) and, in the same PR, remove the branch from `lines` and the workflow lists, and drop the prerelease wording. `pnpm check:dist` fails on a stable version while a package or starter `README.md` still says `@beta`. Tegami treats the prerelease versions as pending on `main` and opens the stable Version Packages PR, with every replayed note.

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

The maintainer picks the bump. A breaking change is a `major`, and it is never silent: [changelog.md](./changelog.md).

- Write one file per changed package (`"@dimah-s3/<pkg>": minor`), plus one `group:dimah-s3` file with the upgrade overview when the whole line moves.
- Add or update the docs upgrade page (`apps/docs/content/docs/(framework)/migration-<version>.mdx`) and link it from the group file.

## Exact peers

`@dimah-s3/ui` pins `@dimah-s3/core` and `@dimah-s3/react`, and `@dimah-s3/db` pins `@dimah-s3/server`, to the exact current version (such as `"2.0.0"`, not a range). The Tegami version step rewrites them with the group bump. `pnpm check:dist` fails when an exact `@dimah-s3/*` peer differs from that package's version.

## Before opening a PR

```bash
pnpm build
pnpm check-types
pnpm test
pnpm check:dist
```

When changing `templates/**` or template maintenance scripts, also run `pnpm templates:build`. Before the new version is on npm, use `pnpm templates:build -- --local`, which packs the workspace packages instead. CI runs the `--local` build for every template in `templates/catalog.json` and `next build` for every example when their inputs change.

CI posts a Tegami release preview comment on the PR. `pnpm tegami pr preview --number <pr> --artifact <file>` builds the same preview locally; it reads the pull request from GitHub, so it needs one.

## Maintainer publish flow

After PRs with pending changelogs merge to `main`:

1. The Publish workflow runs `pnpm tegami ci`, writes `.tegami/publish-lock.yaml`, and opens a **Version Packages** PR.
2. Review and merge that PR (bumped versions + lock + changelogs).
3. The next Publish run publishes to npm, creates the shared git tag (`dimah-s3@x.y.z`), and a GitHub release.

GitHub caps a pull request body at 65,536 characters and a release body at 125,000. When the notes would not fit, the Version Packages PR and the release list each changelog by title and link the package `CHANGELOG.md` files, which keep every note (`VERSION_PR_BUDGET` and `RELEASE_BUDGET` in `scripts/tegami.mts`).

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
