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

`workflow_run` always runs `publish.yml` from the default branch. A change to that file on `v2` does nothing until it is also on `main`: cherry-pick workflow changes there.

## Shipping 2.0.0

When 2.0.0 is ready, `v2` is merged into `main`. `main` has no `prerelease`, so Tegami treats every `2.0.0-beta.N` version as pending there: the first green CI run on the merged `main` opens **version packages (2.0.0)** with no new changelog, and merging that PR publishes `2.0.0` as `latest`. Nothing defers it, so everything below that says "before" must be in the merge. See [Multiple Release Lines](https://tegami.fuma-nama.dev/multi-version).

Before the merge:

1. **Cut `v1`** from the last 1.x commit on `main`. On the `v1` branch, add `v1: { distTag: "release-1.x" }` to `lines` in `scripts/tegami.mts` and add `v1` to the branch lists in `ci.yml` and `tegami-pr.yml`. The dist-tag cannot be `v1`: npm refuses a tag name that parses as a semver range, and `npm i pkg@v1` would resolve as the range, never as the tag.
2. **On `main`**, add `v1` to `publish.yml` (the trigger and the `if`), since that is the copy that runs. Give `v1` a branch ruleset like `Lock v2`, and switch `Lock main` to the single required check `CI passed`, which the 2.0 `ci.yml` reports.
3. **Carry over 1.x-only fixes.** Cherry-pick into `v2` any fix that exists only on `main`, with its `.tegami` file. Never cherry-pick a Version Packages commit.
4. **Flip the beta wording** on the branch that will be merged (the checklist below). On a stable version, `pnpm check:dist` fails while a package `README.md` or a snapshotted starter `README.md` still says `@beta` or "2.0 beta": an npm README cannot change without a republish.

The merge:

1. `main` has commits that `v2` does not, including a 1.x Version Packages commit. A plain merge conflicts in every `packages/*/package.json` version, every `CHANGELOG.md`, `.tegami/publish-lock.yaml`, and `pnpm-lock.yaml`. **`v2` wins for all of them.**
2. The simplest way to say that: on a branch from `v2`, run `git merge -s ours origin/main` (it records `main` as merged and keeps the `v2` tree), add the flip commit, and open that branch as the PR into `main`.
3. In the same PR, remove `v2` from `lines` in `scripts/tegami.mts` and from the branch lists in `ci.yml`, `publish.yml`, and `tegami-pr.yml`. A changelog pushed to a `v2` that is still a release line would publish `2.0.1-beta.0`. Then lock or delete the `v2` branch.

After `2.0.0` is on npm:

1. **Move the `beta` dist-tag.** It still points at the last beta, and every published beta README says `npx @dimah-s3/cli@beta create`. For each of the six packages run `npm dist-tag add @dimah-s3/<pkg>@2.0.0 beta`, or remove the tag with `npm dist-tag rm @dimah-s3/<pkg> beta`. Optionally deprecate the `2.0.0-beta.*` versions.
2. **Docs.** `s3.dimah.dev` already serves the `v2` line and `v1.s3.dimah.dev` serves `main`. Point `s3.dimah.dev` at `main` and `v1.s3.dimah.dev` at the `v1` branch.
3. Run `pnpm templates:update` so the starters pin `^2.0.0`.

### Flip the beta wording

Every place that says "2.0 beta", `@beta`, or "betas can include breaking changes":

- [ ] `packages/{core,server,react,ui,db,cli}/README.md` (banner and install lines)
- [ ] `templates/{nextjs,vite,hono}/README.md` (shipped inside the CLI and copied into every new app), `templates/README.md`
- [ ] Root `README.md` (the badge points at the `beta` tag), `SECURITY.md` (the supported-versions table gains the `release-1.x` line), `CONTRIBUTING.md`
- [ ] `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`
- [ ] `examples/with-nextjs/README.md`, `examples/with-nextjs/AGENTS.md`, `examples/with-db/README.md`
- [ ] `docs/agents/` (this file's release-lines table, `cli.md`, `packages.md`, `changelog.md`)
- [ ] `apps/docs`: the beta banner, the `@beta` install commands, and the "Upgrade to 2.0 beta" titles
- [ ] `scripts/templates-update.mjs` (it pins starters to the npm `beta` tag while the CLI is a prerelease)

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

When changing `templates/**` or template maintenance scripts, also run `pnpm templates:build`. Before the new version is on npm, use `pnpm templates:build -- --local`, which packs the workspace packages instead. CI runs the `--local` build for every template in `templates/catalog.json` and `next build` for every example when their inputs change.

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
