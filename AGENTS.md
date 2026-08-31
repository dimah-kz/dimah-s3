---
description: dimah-s3 monorepo — agent index; open detail only when needed
alwaysApply: true
---

# Agent guide (index)

Index + constraints. **Explore the codebase** for handlers, hooks, and registry items. Open [docs/agents/](docs/agents/) only for **how to add or change** published behavior.

## Integrating this library

Do not treat this monorepo as the app guide. Use
[the docs](https://dimah-s3.vercel.app/docs).

- Never expose S3 credentials to the client.
- The client sends a route name; the server owns keys. Default key is
  `{keyPrefix}/{uuid}/{name}` (`keyPrefix` defaults to the route name).
  Return `{ folder? }` or `{ key? }` from `upload.object` (`metadata` /
  `acl` optional). Follow-up keys must stay under `keyPrefix` unless it is
  `false` (then generated keys are `{uuid}/{name}`).
- Trust `onConfirmed` (HeadObject, including multipart complete) for size
  and type, not the presign body.

## Workflow

1. Touch a file → matching [.cursor/rules/\*.mdc](.cursor/rules/) applies.
2. Adding/changing a feature → **Read** the relevant [docs/agents/](docs/agents/) checklist.
3. New code? Search the target package first — [architecture.md § Placement](docs/agents/architecture.md#placement).
4. **Git:** commit when asked; **never `git push`** (or force-push) unless the human explicitly asks. Stop after the local commit and leave publishing to the remote to them.

## Stack (one line)

pnpm + Turbo monorepo; `@dimah-s3/{core,server,db,react,ui,cli}` (tsup, ESM, Tegami `dimah-s3` package group). UI i18n via Fuma Translate (`@fuma-translate/react`; import the hook from there, not `@dimah-s3/react`). Shared `@workspace/eslint-config` + `@workspace/typescript-config` under `tooling/`; `pnpm lint` / `pnpm check-types` cover all workspace packages. User starters live in `templates/` (CLI snapshot source — published npm ranges); monorepo demos stay in `examples/`.

## Docs map

| Topic                                          | Read when                             |
| ---------------------------------------------- | ------------------------------------- |
| [architecture.md](docs/agents/architecture.md) | Package boundaries, placement, scope  |
| [packages.md](docs/agents/packages.md)         | Core / server / react API or protocol |
| [registry.md](docs/agents/registry.md)         | UI component or shadcn registry item  |
| [cli.md](docs/agents/cli.md)                   | Scaffold CLI or templates catalog     |
| [release.md](docs/agents/release.md)           | Version bump / Tegami changelog       |

## Non-negotiables

- **Scope:** presign upload / download / delete flows only — no SDK wrappers for trivial S3 ops.
- **Auth / quota:** consumer `DimahS3Config` hooks — never inside library packages. Optional DB via `@dimah-s3/db` `db()` plugin (not ORM inside `server`).
- **Deps:** `core` ← `server` \| `react` ← `ui`; `db` → `server` (peer); no reverse ORM into `server`. UI: Fuma Translate. API errors: stable `code` + English `message` (localize on the client).
- **Protocol SSOT:** `S3_API_ROUTES` + `createS3Client` in `@dimah-s3/core`; server exposes them via `dimahS3().handler` / `.api` — keep server + client in sync.
- **Registry catalog:** never hand-edit `packages/ui/registry.json` — source is `packages/ui/scripts/registry-items.ts` + `packages/ui/src/`.
- **Stock shadcn UI:** never hand-edit `packages/ui/src/components/ui/` — compose in `components/dimah-s3/` / `lib/` / `hooks/`; refresh with `pnpm --filter @dimah-s3/ui sync:shadcn` ([registry.md](docs/agents/registry.md)).
- **Published API change:** add a Tegami changelog under `.tegami/` ([release.md](docs/agents/release.md)).
- **RTL-safe styling:** default copy/design is English + LTR, but UI classes must stay direction-safe so RTL can be enabled later without layout breakage. Prefer logical utilities (`text-start`, `text-end`, `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`) over physical ones (`text-left/right`, `ml/mr`, `pl/pr`, `left/right`) unless the physical side is truly required by behavior (for example side-specific tooltip arrow placement).

Humans: [README.md](README.md) · [release.md](docs/agents/release.md)

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
