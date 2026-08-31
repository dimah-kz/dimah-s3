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

| Change                                                                                                                                             | Package / path                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Route constants, `S3Api`, `createS3Client`, `DimahS3Error`, client plugins (`src/plugin/`)                                                         | `packages/core/src/`                                          |
| Presign endpoints (`api/routes`), `dimahS3`, `route()`, plugin subsystem. HTTP `createS3Router` is internal (`packages/server/src/api/router.ts`). | `packages/server/src/`                                        |
| React hooks, i18n types (`Translations`), upload client logic                                                                                      | `packages/react/src/`                                         |
| Pre-built components                                                                                                                               | `packages/ui/src/`                                            |
| Optional DB schema + `db()` / `dbClient()`                                                                                                         | `packages/db/src/`                                            |
| Scaffold CLI (`dimah-s3 create`)                                                                                                                   | `packages/cli/`                                               |
| shadcn manifests                                                                                                                                   | `packages/ui/scripts/registry-items.ts`; root `registry.json` |
| Docs site copy                                                                                                                                     | `apps/docs/`                                                  |
| Runnable demo (same as template, `workspace:*`)                                                                                                    | `examples/with-{nextjs,vite,hono}/`                           |
| Runnable demo + `@dimah-s3/db`                                                                                                                     | `examples/with-db/`                                           |
| User-facing app starters (`@dimah-s3/cli` snapshot source)                                                                                         | `templates/<id>/`                                             |
| Shared ESLint / TSConfig                                                                                                                           | `tooling/{eslint,typescript}-config/`                         |

**Default:** edit the smallest package that owns the behavior. Shared protocol → `core` first, then wire server + react.

## Design rules

1. Multi-step presign / multipart / delete confirmation only — trivial `@aws-sdk/client-s3` calls stay with the user.
2. Server stays framework-agnostic; adapters live under `@dimah-s3/server/{next,node,express,hono,fastify,elysia,svelte-kit}` (structural types — no framework peer deps).
3. React is headless; UI is optional registry or npm package.
4. Config is route-only: `dimahS3({ routes })` is required. The instance holds `client` / `bucket` / `plugins`; each `route()` nests `upload` / `download` / `delete`. Upload owns `fileTypes`, `object`, and opt-in `multipart`. The client sends a route name; the server owns keys (`object` or `{route}/{uuid}/{name}`).
5. Multipart is opt-in on the upload policy (`upload.multipart: true`). Init/complete share `upload.guard` / `confirmGuard` / `onConfirmed`. The client threshold (~50 MB) is internal — not a consumer knob.
6. Server plugins implement `{ id, hooks?, endpoints?, context?, dependsOn?, init? }` via `definePlugin` in `packages/server/src/plugin/`. Client plugins use `defineClientPlugin` in `@dimah-s3/core` and mount via `createS3Client({ plugins })`. Paths share `pluginPath`. Feature packages (e.g. `db()` / `dbClient()`) live outside `server`; merge happens once in `dimahS3()`. Context is available on `s3.context[id]` and flattened onto the instance (`s3[id]`). `DimahS3Error` (core) extends better-call `APIError` with the same `(status, body)` constructor; HTTP uses native `toResponse`. Detect with `isAPIError` / `isDimahS3Error` / `isS3ErrorCode` (do not rely on `name === "APIError"` alone). Client `createS3Fetch` uses better-fetch `errorSchema` (`s3FetchErrorSchema`) and maps non-OK JSON onto the same class. `createS3Client` exposes `$ERROR_CODES`, `$fetch`, and `$Infer`. React `createS3Client` is the API object plus `Provider` / `useApi`.

## Forbidden

- Auth or quota logic inside library packages (consumer hooks / user config).
- ORM / FumaDB imports inside `@dimah-s3/server` — DB adapters stay in `@dimah-s3/db`.
- Importing `ui` or `react` from `server` / `core`.
- Hand-editing `packages/ui/registry.json` (generated — [registry.md](./registry.md)).
- Hand-editing `packages/ui/src/components/ui/` (stock shadcn — compose in `dimah-s3` / `lib` / `hooks`; refresh via `pnpm --filter @dimah-s3/ui sync:shadcn` — [registry.md](./registry.md)).
