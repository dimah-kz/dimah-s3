# Published packages

Explore the package you are changing. This file is what to **keep in sync**, not an API reference.

## Protocol

Keep these in lockstep (same paths, same payloads — no duplicate route strings):

1. `@dimah-s3/core` — route constants, Zod schemas, types, `createS3Client`
2. `@dimah-s3/server` — `createS3Endpoint` handlers. The HTTP router is internal; do not export it.
3. `@dimah-s3/react` — hooks and React `createS3Client`

Upload keys are server-owned: core upload / multipart-init schemas must not take a client `key`. Confirm size and type from HeadObject, not the presign body.

Browser `S3Api` uses object args; server `s3.api` is the better-call map. Match existing call sites.

Changelog: [release.md](./release.md).

## Endpoint

1. Add the handler next to existing ones under `packages/server/src/api/`.
2. Register it the same way current endpoints are registered.
3. Extend hook context types if the endpoint runs consumer hooks.
4. Gate with the route feature flags already used by the open-route helpers. Disabled features stay registered and return `FEATURE_DISABLED`.
5. Auth and side effects belong in consumer `guard` / `on*` hooks, not new library auth.

Reuse helpers already exported from `packages/server/src/helpers/` (keys, constraints, HeadObject). Do not reimplement them.

New HTTP adapter: add it next to existing files in `packages/server/src/adapters/`, export from `package.json`, prefer structural types (no framework peer deps). Public entry stays `dimahS3(config)`.

## Plugin

Contract and merge live in `packages/server/src/plugin/`. Feature plugins (like `db()`) live in their own package and peer-depend on server.

- HTTP: `createS3Endpoint` + shared `pluginPath` from core. Do not export raw better-call `createEndpoint`.
- Client: `defineClientPlugin` in core. React apps use `createS3Client` from `@dimah-s3/react`. Keep ORM off the client entry.
- Merge once in `dimahS3()` — never inside an endpoint.
- Expose data on `plugin.context` (`s3.context[id]` / flattened `s3[id]`). Do not hardcode per-plugin fields on `DimahS3`.
- Hook order is load-bearing: **guards** run plugins then user; lifecycle **`on*`** run user then plugins (confirm rollback / `db().markActive` depend on this).

## React hook

Add it next to existing hooks. Fetch only through `S3Api` from core.

Public hooks that hit the API take a typed `route` (`S3RouteName` — augment `DimahS3Routes`). Wired UI receives the hook return; it does not call the hook. Upload does not take a client object key.

Export from `src/index.ts` when public.

## Strings and errors

- React / UI: `t()` / `useTranslations()` from `@fuma-translate/react` (do not re-export). Then `pnpm --filter @dimah-s3/react compile:translations`. Formatters that map codes to copy must call `useTranslations()` themselves.
- Server: throw `APIError` with `S3_ERROR_CODES` (`code` + English `message`). Detect with `isAPIError` / `isS3ErrorCode`. Do not add a custom HTTP serializer — throw and let the router `toResponse`.

## Build

Each package: `tsup` → `dist/`. New public path → `package.json` `exports`. Shared configs live in `tooling/`.

## Done

- [ ] Behavior sits in the owning package ([architecture.md](./architecture.md))
- [ ] Protocol change updated core, server, and react together
- [ ] Types exported; breaking rename has a major Tegami changelog
- [ ] `pnpm build && pnpm check-types && pnpm lint && pnpm test` pass
