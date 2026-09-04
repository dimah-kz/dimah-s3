---
description: dimah-s3 library monorepo — invariants only; explore src, open docs/agents to change published behavior
alwaysApply: true
---

# dimah-s3

This repository **is the library**, not an app. Consumer integration: [the docs](https://dimah-s3.vercel.app/docs).

Explore `packages/*/src` for how things work. [docs/agents/](docs/agents/) is **checklists for changing published behavior** — not a map of the repo, and not a substitute for reading the code.

pnpm + Turbo. From the root: `pnpm lint`, `pnpm check-types`, `pnpm test`.

## Invariants

- Never put S3 credentials on the client. The client sends a **route name**; the server owns object keys. Trust HeadObject (`onConfirmed`) for size and type, not the presign body.
- Scope: presign upload / download / delete. Do not wrap trivial S3 APIs (`s3.put` and proxy `GET /file` are the exceptions). Auth and quota live in consumer hooks, not library packages. Optional DB is `@dimah-s3/db` `db()` — no ORM inside `server`.
- Deps: `core` ← `server` | `react` ← `ui`; `db` → `server` (peer); `cli` is scaffold-only. Protocol SSOT is `@dimah-s3/core`. API errors: stable `code` + English `message`.
- Do not hand-edit `packages/ui/registry.json` or `packages/ui/src/components/ui/`.
- Published `@dimah-s3/*` behavior, API, or build output change → changelog under `.tegami/` ([release.md](docs/agents/release.md)). Do not edit `.tegami/publish-lock.yaml` or package `CHANGELOG.md` files.
- Commit when asked. Never `git push` (or force-push) unless the human explicitly asks.

`templates/` = CLI starters (published npm ranges, not a workspace member). `examples/` = workspace demos. `apps/docs` = product docs. `apps/brand` = local promo studio. `docs/agents/` = these maintainer checklists.

## Checklists

Read the matching file **when changing published behavior**. Skip it for a local fix — match the surrounding code.

| File                                           | Read when                                       |
| ---------------------------------------------- | ----------------------------------------------- |
| [architecture.md](docs/agents/architecture.md) | New package, or moving behavior across packages |
| [packages.md](docs/agents/packages.md)         | Protocol, endpoint, plugin, or hook             |
| [registry.md](docs/agents/registry.md)         | UI component or shadcn registry item            |
| [cli.md](docs/agents/cli.md)                   | Scaffold CLI or templates catalog               |
| [release.md](docs/agents/release.md)           | Tegami changelog / version bump                 |
| [brand.md](docs/agents/brand.md)               | Promo still or video                            |
