---
description: dimah-s3 monorepo — agent index; open detail only when needed
alwaysApply: true
---

# Agent guide (index)

Index + constraints. **Explore the codebase** for handlers, hooks, and registry items. Open [docs/agents/](docs/agents/) only for **how to add or change** published behavior.

## Workflow

1. Touch a file → matching [.cursor/rules/\*.mdc](.cursor/rules/) applies.
2. Adding/changing a feature → **Read** the relevant [docs/agents/](docs/agents/) checklist.
3. New code? Search the target package first — [architecture.md § Placement](docs/agents/architecture.md#placement).

## Stack (one line)

pnpm + Turbo monorepo; `@dimah-s3/{core,server,db,react,ui}` (tsup, ESM, Tegami `dimah-s3` package group). UI i18n via Fuma Translate (`@fuma-translate/react`; import the hook from there, not `@dimah-s3/react`). Shared `@workspace/eslint-config` + `@workspace/typescript-config`; `pnpm lint` / `pnpm check-types` cover all workspace packages.

## Docs map

| Topic                                          | Read when                             |
| ---------------------------------------------- | ------------------------------------- |
| [architecture.md](docs/agents/architecture.md) | Package boundaries, placement, scope  |
| [packages.md](docs/agents/packages.md)         | Core / server / react API or protocol |
| [registry.md](docs/agents/registry.md)         | UI component or shadcn registry item  |
| [release.md](docs/agents/release.md)           | Version bump / Tegami changelog       |

## Non-negotiables

- **Scope:** presign upload / download / delete flows only — no SDK wrappers for trivial S3 ops.
- **Auth / quota:** consumer `DimahS3Config` hooks — never inside library packages. Optional DB via `@dimah-s3/db` `db()` plugin (not ORM inside `server`).
- **Deps:** `core` ← `server` \| `react` ← `ui`; `db` → `server` (peer); no reverse ORM into `server`. UI: Fuma Translate. API errors: stable `code` + English `message` (localize on the client).
- **Protocol SSOT:** `S3_API_ROUTES` + `createS3Client` in `@dimah-s3/core`; server exposes them via `dimahS3().handler` / `.api` — keep server + client in sync.
- **Registry output:** never hand-edit `registry/registry/dimah-s3-ui/` — source is `packages/ui/src/`.
- **Published API change:** add a Tegami changelog under `.tegami/` ([release.md](docs/agents/release.md)).
- **RTL-safe styling:** default copy/design is English + LTR, but UI classes must stay direction-safe so RTL can be enabled later without layout breakage. Prefer logical utilities (`text-start`, `text-end`, `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`) over physical ones (`text-left/right`, `ml/mr`, `pl/pr`, `left/right`) unless the physical side is truly required by behavior (for example side-specific tooltip arrow placement).

Humans: [README.md](README.md) · [RELEASING.md](RELEASING.md)

# Release workflow

This repository uses [Tegami](https://tegami.fuma-nama.dev) for versioning and publishing.

## Write changelog files

Create pending changelog files under `.tegami/` as `YYYY-MM-DD-{hash}.md`.

See the [changelog format docs](https://tegami.fuma-nama.dev/changelog) for details.

### Example

```md
---
packages:
  group:dimah-s3: patch
---

### Fix button hover state

The hover color now matches the design system.
```

### Package references

Use package names, ids, or groups in frontmatter. For example:

- `"@dimah-s3/core"` — package name
- `"npm:@dimah-s3/core"` — package id
- `"group:dimah-s3"` — every published `@dimah-s3/*` package (preferred for line-wide bumps)

Rules:

- Include YAML frontmatter with `packages`
- Include at least one `#`, `##`, or `###` heading in the body
- Write user-facing release notes under each heading
- Do not edit the publish lock file (`.tegami/publish-lock.yaml`) or package `CHANGELOG.md` files directly
