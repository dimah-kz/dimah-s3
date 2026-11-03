# Published packages

Explore the package you are changing. This file is what to **keep in sync**, not an API reference.

## Protocol

Keep these in lockstep (same paths, same payloads — no duplicate route strings):

1. `@dimah-s3/core` — route constants and limits, types, the error catalog, `createS3Client`; the Zod schemas in `@dimah-s3/core/schema`, which the root never imports
2. `@dimah-s3/server` — operations and their `createS3Endpoint` handlers. The HTTP router is internal; do not export it.
3. `@dimah-s3/react` — hooks, the engine, and React `createS3Client`

Upload keys are server-owned: core upload / multipart-init schemas must not take a client `key`. Confirm size and type from HeadObject, not the presign body.

Presign and multipart init return a signed upload `ticket`. Confirm and every later multipart call send only `{ ticket }`; the server reads the key, upload id, declared file and part layout from it. Do not add a follow-up call that trusts a client key or upload id.

Wire and server-context file fields are `name` / `size` / `type`. React props, options and stored records use `fileName` / `fileSize` / `contentType`. `db()` rows, and the `DbClientObject` that mirrors them, use their column names (`filename`, `contentType`, `size`).

Every `S3Api` method takes `(payload, options?)`. In the browser `options` is `{ signal, headers }`; on the server `s3.api` takes `{ headers, request, locals }`. Keep `s3.api` the same shape as the browser client.

Changelog: [release.md](./release.md).

## Endpoint

1. Put the logic in `packages/server/src/operations/` so `s3.api` and HTTP share it. The HTTP handler only reads its input and calls the operation.
2. Add the path to `S3_API_ROUTES` in core, the handler to `api/core-endpoints.ts` under the same name, and the method to `operations/s3-api.ts`.
3. Extend hook context types in `types/hook-contexts.ts` if the endpoint runs consumer hooks. Every context carries `operation` and `locals`.
4. Gate with the route feature flags already used by the open-route helpers. Disabled features stay registered and return `FEATURE_DISABLED`.
5. Auth and side effects belong in consumer `guard` / `on*` hooks, not new library auth.
6. Body endpoints accept JSON only (`createS3Endpoint` sets `allowedMediaTypes`). Bodies are capped by `maxRequestBodySize`.
7. A new way to start an upload runs `upload.object()` and `upload.guard`, then `upload.onStart({ kind, ... })` with a new `kind`, the way presign, multipart init and `s3.put` do. A browser upload returns a ticket from `issueTicket` (`helpers/ticket.ts`), and every follow-up call verifies it. Add the `kind` to `UploadKind`.

Reuse helpers already in `packages/server/src/helpers/` (keys, constraints, HeadObject, tickets, part layout). Do not reimplement them.

New HTTP adapter: add it next to existing files in `packages/server/src/adapters/`, export from `package.json`, prefer structural types (no framework peer deps). Stream the body and abort the S3 call on disconnect, as the Node adapters do. Public entry stays `dimahS3(config)`.

## Plugin

Contract and merge live in `packages/server/src/plugin/`. Feature plugins (like `db()`) live in their own package and peer-depend on server.

- HTTP: `createS3Endpoint` from `@dimah-s3/server/plugins` + shared `pluginPath` from core. Do not export raw better-call `createEndpoint`. Plugin endpoints are HTTP only; they do not appear on `s3.api`.
- Client: `defineClientPlugin` in core. React apps use `createS3Client` from `@dimah-s3/react`. Keep ORM off the client entry.
- Merge once in `dimahS3()` — never inside an endpoint.
- Expose data on `plugin.context` (`s3.context[id]` / flattened `s3[id]`). Do not hardcode per-plugin fields on `DimahS3`.
- Hook order is load-bearing: guards run instance → route → feature, and within each, **plugins first, then the user**. Lifecycle **`on*`** hooks also run plugins first, so user hooks see consistent db state.
- A plugin may bind tickets to a caller with `hooks.ticketSubject`.

## db schema

The `@dimah-s3/db` schema has several hand-kept copies. Readers use one schema, `2.1.0` (`dbSchema` in `src/schema/schema.ts`). The package does not migrate a 1.x database or an earlier beta schema.

FumaDB skips `up` on the first schema, and the indexes live in `up`, so `schemas` starts with an empty predecessor (`0.0.1`). A finished database is at `2.1.0`. Keep the predecessor: without it, `migrate()` creates the tables and skips the indexes.

While 2.0 is in beta, a table change replaces `dbSchema` in place and bumps its version. Do not add an upgrade chain. A database at another version is recreated. Change the copies together:

1. Replace `dbSchema` in `src/schema/schema.ts` (`DB_SCHEMA_VERSION` follows it).
2. Update `src/drizzle/{sqlite,pg,mysql}.ts` (users copy these into their app; `examples/with-db/db/schema.ts` matches `sqlite.ts`), `sql/<dialect>.sql`, and `prisma/dimah-s3.prisma`.
3. `src/drizzle/parity.test.ts` and `src/schema/schema.test.ts` must pass.
4. List the schema change under `#### Breaking changes` in the db changelog, and update the docs upgrade page (`apps/docs/content/docs/(framework)/db/upgrade.mdx`).

## React hook

Add it next to existing hooks. Fetch only through `S3Api` from core.

Public hooks that hit the API take a typed `route` (`S3RouteName` — augment `DimahS3Routes`). Wired UI receives the hook return; it does not call the hook. Upload does not take a client object key.

- Keep state per key in the operation store. A second call for a key in flight joins it. Actions return an outcome or result object.
- Every client error is an `APIError` built with `s3Error`; aborts reject with a `DOMException`.
- Export hooks and types from `src/index.ts` (the `"use client"` entry). Plain functions go in `src/engine.ts` (`@dimah-s3/react/engine`), which must not import React. Do not re-export anything from core.

## Strings and errors

- React / UI: `t()` / `useTranslations()` from `@fuma-translate/react` (do not re-export). Then `pnpm --filter @dimah-s3/react compile:translations`. Formatters that map codes to copy must call `useTranslations()` themselves; a new catalog code needs a case in `useFormatDimahError`.
- Codes live in `S3_ERROR_CODES` (`packages/core/src/error-codes.ts`): each entry has a `status`, an English message template filled from typed `params`, and `client: true` when only the browser raises it. Name codes noun first (`UPLOAD_TICKET_INVALID`). First-party plugin codes (`FOLDER_*`, `OBJECT_EXISTS`) live there too, so react can word them. `CONFLICT` means a concurrent change won; use a specific code for a state the user must change.
- Throw `s3Error(code, params)`; plugin-only codes use `APIError.from(status, { code, message })`. Detect with `isS3ErrorCode(error, code)`. Do not add a custom HTTP serializer — throw and let the error boundary build the response. Config problems are logged and return `500 INTERNAL_ERROR`.

## Build

Each package: `tsup` → `dist/`. New public path → `package.json` `exports`. Shared configs live in `tooling/`. Client entries get `"use client"` from `packageConfig({ clientEntries })`, never from a source banner.

After `pnpm build`, `pnpm check:dist` checks that every `exports` path exists and declares its runtime exports, that `"use client"` starts only the react and ui `dist/index.js`, that `@dimah-s3/react/engine` imports no React, that the `@dimah-s3/core` root imports no Zod, and that exact `@dimah-s3/*` peers match the current version.

## Done

- [ ] Behavior sits in the owning package ([architecture.md](./architecture.md))
- [ ] Protocol change updated core, server, and react together
- [ ] Types exported; a breaking change is listed under `#### Breaking changes` in a Tegami changelog
- [ ] `pnpm build && pnpm check-types && pnpm lint && pnpm test && pnpm check:dist` pass
