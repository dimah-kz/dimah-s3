# Release & Tegami

All `@dimah-s3/*` published packages version **together** (`group: dimah-s3` with `syncBump` / `syncGitTag` in `scripts/tegami.mts`).

## When to add a changelog

Add one when any published package changes **behavior, public API, or build output**:

```bash
pnpm tegami
```

Or write a Markdown file under `.tegami/` — prefer `group:dimah-s3` when the whole line should bump. Skip for repo-only docs, CI, or typos with no package impact — see [RELEASING.md](../../RELEASING.md).

## Before opening a PR

```bash
pnpm build
pnpm check-types
```

## Bump types

| Type  | When                                      |
| ----- | ----------------------------------------- |
| patch | Fix, internal-safe improvement            |
| minor | Backward-compatible feature               |
| major | Breaking API, types, or consumer contract |

Write the summary from the **npm consumer** perspective — not implementation detail. Body needs at least one heading.

Example:

```md
---
packages:
  group:dimah-s3: minor
---

## Add optional `cause` to `DimahS3Error`

Support error chaining for consumers.
```

Maintainer publish flow: [RELEASING.md](../../RELEASING.md).
