# Release & Tegami

All `@dimah-s3/*` published packages version **together** (`group: dimah-s3` with `syncBump` / `syncGitTag` in `scripts/tegami.mts`).

Format details: [Tegami changelogs](https://tegami.fuma-nama.dev/changelog). Do not edit `.tegami/publish-lock.yaml` or package `CHANGELOG.md` files directly.

## When to add a changelog

Add one when any published package changes **behavior, public API, or build output**:

```bash
pnpm tegami
```

Or write a Markdown file under `.tegami/` as `YYYY-MM-DD-{hash}.md`. Prefer `group:dimah-s3` when the whole line should bump.

Skip for repo-only docs, CI/config, or typos with no package output impact.

Frontmatter needs `packages`. Body needs at least one `#` / `##` / `###` heading. Write from the **npm consumer** perspective.

```md
---
packages:
  group:dimah-s3: patch
---

### Fix button hover state

The hover color now matches the design system.
```

Package references: `"@dimah-s3/core"`, `"npm:@dimah-s3/core"`, or `"group:dimah-s3"` (preferred for line-wide bumps).

## Bump types

| Type  | When                                      |
| ----- | ----------------------------------------- |
| patch | Fix, internal-safe improvement            |
| minor | Backward-compatible feature               |
| major | Breaking API, types, or consumer contract |

## Before opening a PR

```bash
pnpm build
pnpm check-types
pnpm test
```

When changing `templates/**` or template maintenance scripts, also run `pnpm templates:build`.

CI posts a Tegami release preview comment on the PR.

## Maintainer publish flow

After PRs with pending changelogs merge to `main`:

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

| Command               | Purpose                                |
| --------------------- | -------------------------------------- |
| `pnpm tegami`         | Create a changelog interactively       |
| `pnpm tegami version` | Draft bumps and write the publish lock |
| `pnpm tegami publish` | Publish from the publish lock          |
| `pnpm tegami ci`      | Version if pending, otherwise publish  |
