# Releasing and Versioning

This repository uses [Tegami](https://tegami.fuma-nama.dev/) and follows Semantic Versioning.

All published `@dimah-s3/*` packages release together as the `dimah-s3` package group (`syncBump` + `syncGitTag` in `scripts/tegami.mts`).

## Release standard

Use SemVer for every published package:

- **patch** (`0.1.2` → `0.1.3`): bug fixes, docs or behavior improvements with no breaking API/output changes.
- **minor** (`0.1.2` → `0.2.0`): backward-compatible new features.
- **major** (`0.1.2` → `1.0.0`): breaking API, contract, or output changes.

## Typical contributor flow

1. Implement change.
2. Run checks locally:

```bash
pnpm build
pnpm check-types
pnpm test
```

3. Add a changelog when package behavior/API/output changes:

```bash
pnpm tegami
```

Prefer targeting the whole group with `group:dimah-s3` when the change affects the published line. Commit the generated `.tegami/*.md` file with your PR.

4. Open a Pull Request. CI posts a Tegami release preview comment.

## Maintainer release flow

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
- **Allowed actions:** `npm publish`

Without that, OIDC token exchange returns 404 and publish falls back to `NPM_TOKEN`. Configure Trusted Publisher when adding a **new** package under the scope (after its first classic-token publish, if needed).

## How to write a good changelog

Changelog files live under `.tegami/` and need:

- affected package(s) or `group:dimah-s3`
- bump type (`patch`, `minor`, `major`) — explicit frontmatter or heading depth
- at least one Markdown heading and a short user-facing summary

Example:

```md
---
packages:
  group:dimah-s3: minor
---

## Add optional `cause` to `DimahS3Error`

Support error chaining for consumers.
```

Guidelines:

- Write from the package consumer perspective.
- Explain behavior/API impact, not implementation details.
- Keep one logical change per file when possible.

See [Tegami changelogs](https://tegami.fuma-nama.dev/changelog).

## When a changelog is not required

You can skip a changelog for:

- repository-only docs updates
- CI/config changes that do not affect published package behavior
- typo fixes with no package output impact

## Local commands

| Command               | Purpose                                |
| --------------------- | -------------------------------------- |
| `pnpm tegami`         | Create a changelog interactively       |
| `pnpm tegami version` | Draft bumps and write the publish lock |
| `pnpm tegami publish` | Publish from the publish lock          |
| `pnpm tegami ci`      | Version if pending, otherwise publish  |
