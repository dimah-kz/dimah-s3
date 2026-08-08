# Architecture & placement

> Rule: `.cursor/rules/architecture.mdc`.

**Repo scope:** thin presign protocol + headless React hooks + optional shadcn UI. Consumers own S3 client config and auth. Optional persistence ships as a server plugin from `@dimah-s3/db`.

## Package chain

```
@dimah-s3/core
        ↓
@dimah-s3/server | @dimah-s3/react  ←  @dimah-s3/ui
        ↑
@dimah-s3/db  (peer: server — `db()` plugin)

@dimah-s3/cli  (scaffold only — no deps on the library chain)
```

`apps/docs` and `examples/*` consume workspace packages — not published.
`templates/*` are standalone starters (published `@dimah-s3/*` ranges) snapshotted into `@dimah-s3/cli` at build time.

## Placement {#placement}

| Change                                                                                     | Package / path                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------- |
| Route constants, `S3Api`, `createS3Client`, `DimahS3Error`, client plugins (`src/plugin/`) | `packages/core/src/`                |
| Presign procedures, `dimahS3`, hooks, plugin subsystem (`src/plugin/`)                     | `packages/server/src/`              |
| React hooks, i18n types (`Translations`), upload client logic                              | `packages/react/src/`               |
| Pre-built components                                                                       | `packages/ui/src/`                  |
| Optional DB schema + `db()` / `dbClient()`                                                 | `packages/db/src/`                  |
| Scaffold CLI (`dimah-s3 create`)                                                           | `packages/cli/`                     |
| shadcn manifests                                                                           | `registry/items/` (after UI source) |
| Docs site copy                                                                             | `apps/docs/`                        |
| Runnable demo (same as template, `workspace:*`)                                            | `examples/with-nextjs/`             |
| Runnable demo + `@dimah-s3/db`                                                             | `examples/with-db/`                 |
| User-facing app starters (`@dimah-s3/cli` snapshot source)                                 | `templates/<id>/`                   |

**Default:** edit the smallest package that owns the behavior. Shared protocol → `core` first, then wire server + react.

## Design rules

1. Multi-step presign / multipart / delete confirmation only — trivial `@aws-sdk/client-s3` calls stay with the user.
2. Server stays framework-agnostic; adapters live under `@dimah-s3/server/{next,node,express,hono,fastify,elysia,svelte-kit}` (structural types — no framework peer deps).
3. React is headless; UI is optional registry or npm package.
4. Multipart threshold (~30 MB) is internal — not a consumer knob unless config already exposes it.
5. Server plugins implement `{ id, hooks?, endpoints?, context?, dependsOn?, init? }` via `definePlugin` in `packages/server/src/plugin/`. Client plugins use `defineClientPlugin` in `@dimah-s3/core` and mount via `createS3Client({ plugins })`. Paths share `pluginEndpointPath`. Feature packages (e.g. `db()` / `dbClient()`) live outside `server`; merge happens once in `dimahS3()`. Context is available on `s3.context[id]` and flattened onto the instance (`s3[id]`). `DimahS3Error` lives in `@dimah-s3/core` (re-exported from server); client `createFetcher` throws it on non-OK HTTP.

## Forbidden

- Auth or quota logic inside library packages (consumer hooks / user config).
- ORM / FumaDB imports inside `@dimah-s3/server` — DB adapters stay in `@dimah-s3/db`.
- Importing `ui` or `react` from `server` / `core`.
- Hand-editing `registry/registry/dimah-s3-ui/` (generated — [registry.md](./registry.md)).
