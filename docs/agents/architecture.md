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

`apps/docs`, `apps/brand` (local studio), and `examples/*` consume workspace packages — not published.
`templates/*` are standalone starters (published `@dimah-s3/*` ranges) snapshotted into `@dimah-s3/cli` at build time.

## Placement {#placement}

| Change                                                                                                                                             | Package / path                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Route constants, `S3Api`, `createS3Client`, `APIError`, client plugins (`src/plugin/`)                                                             | `packages/core/src/`                                          |
| Presign endpoints (`api/routes`), `dimahS3`, `route()`, plugin subsystem. HTTP `createS3Router` is internal (`packages/server/src/api/router.ts`). | `packages/server/src/`                                        |
| React hooks, i18n types (`Translations`), upload client logic                                                                                      | `packages/react/src/`                                         |
| Pre-built components                                                                                                                               | `packages/ui/src/`                                            |
| Optional DB schema + `db()` / `dbClient()`                                                                                                         | `packages/db/src/`                                            |
| Scaffold CLI (`dimah-s3 create`)                                                                                                                   | `packages/cli/`                                               |
| shadcn manifests                                                                                                                                   | `packages/ui/scripts/registry-items.ts`; root `registry.json` |
| Docs site copy                                                                                                                                     | `apps/docs/`                                                  |
| Runnable demo (same as template, `workspace:*`)                                                                                                    | `examples/with-nextjs/`                                       |
| Runnable demo + `@dimah-s3/db`                                                                                                                     | `examples/with-db/`                                           |
| User-facing app starters (`@dimah-s3/cli` snapshot source)                                                                                         | `templates/<id>/`                                             |
| Shared ESLint / TSConfig                                                                                                                           | `tooling/{eslint,typescript}-config/`                         |
| Internal brand studio stills / framecn videos (local, not docs)                                                                                    | `apps/brand/` — [brand.md](./brand.md)                        |

**Default:** edit the smallest package that owns the behavior. Shared protocol → `core` first, then wire server + react.

## Design rules

1. Multi-step presign / multipart / delete confirmation. Policy-aware server upload is `s3.put`. Trivial Copy / List / GetObject / tagging stay with the user.
2. Server stays framework-agnostic; adapters live under `@dimah-s3/server/{next,node,express,hono,fastify,elysia,svelte-kit}` (structural types — no framework peer deps).
3. React is headless; UI is optional registry or npm package. Wired upload / download / delete controls take the hook return as `upload` / `download` / `delete` — they do not call the hook or accept engine options. Target keys (`objectKey`) and chrome stay on the control. Download / delete hook returns include `objectKey` for the active operation so a list can share one instance (single-flight). Call the hook per row only when operations must run concurrently.
4. Config is route-only: `dimahS3({ routes })` is required. The instance holds `client` / `bucket` / `plugins`; each `route()` nests `upload` / `download` / `delete` (`RouteFeature`). All three (and `upload.multipart`) are off until set. Prefer one feature per route; combine on the same route only when those callers share the key namespace (overlapping `keyPrefix` is rejected). Upload owns `fileTypes`, `object`, and opt-in `multipart`. The client sends a route name; the server owns keys (`object` nested under route `keyPrefix`, default `{keyPrefix}/{uuid}/{name}`). Follow-up ops must stay under `keyPrefix` (`false` disables the bound and generates `{uuid}/{name}`). Nested or identical `keyPrefix` values across routes are rejected at init. `GET /routes` (`api.catalog()`) is the client SSOT for `accept` / `maxFileSize` / `multipart` / `checksum`. Confirm and multipart complete `DeleteObject` if HeadObject checks or `onConfirmed` throw. ACL comes from the upload policy, not `GetObjectAcl`. Policy-aware server upload is `s3.put`.
5. Multipart is opt-in on the upload policy (`upload.multipart: true`). Init shares `upload.guard` / `onInit`. Complete runs `multipart.guard` (`action: "complete"`) then `upload.confirmGuard` / `onConfirmed`. The client threshold (~50 MB) is internal — not a consumer knob.
6. Server plugins implement `{ id, hooks?, endpoints?, context?, dependsOn?, init? }` via `definePlugin` in `packages/server/src/plugin/`. Client plugins use `defineClientPlugin` in `@dimah-s3/core` and mount via `createS3Client({ plugins })`. Paths share `pluginPath`. Feature packages (e.g. `db()` / `dbClient()`) live outside `server`; merge happens once in `dimahS3()`. Guards run plugins first then user; lifecycle `on*` hooks run user first then plugins (so `db().markActive` is last and confirm rollback can `DeleteObject`). Context is available on `s3.context[id]` and flattened onto the instance (`s3[id]`). `APIError` (core) is better-call's class; HTTP uses native `toResponse`. Detect with `isAPIError` / `isS3ErrorCode`. Client `createS3Fetch` uses better-fetch `errorSchema` (`s3FetchErrorSchema`) and maps non-OK JSON onto the same class. `createS3Client` exposes `$ERROR_CODES`, `$fetch`, and `$Infer`. React `createS3Client` is the API object plus `Provider` / `useApi`. Hook `route` is `S3RouteName` — augment `DimahS3Routes` (or `InferS3Routes<typeof s3>`) so names are not a free `string`.

## Forbidden

- Auth logic inside `@dimah-s3/server` or `@dimah-s3/core` — consumer `guard` hooks. Optional quota **checks** live in `@dimah-s3/db` (`quota` on `db()` / `createQuotaGuard`); the app still supplies the numbers.
- ORM / FumaDB imports inside `@dimah-s3/server` — DB adapters stay in `@dimah-s3/db`.
- Importing `ui` or `react` from `server` / `core`.
- Hand-editing `packages/ui/registry.json` (generated — [registry.md](./registry.md)).
- Hand-editing `packages/ui/src/components/ui/` (stock shadcn — compose in `dimah-s3` / `lib` / `hooks`; refresh via `pnpm --filter @dimah-s3/ui sync:shadcn` — [registry.md](./registry.md)).
- Wrapping trivial S3 Copy / List / GetObject / tagging — `s3.put` and proxy `GET /file` are the exceptions.
