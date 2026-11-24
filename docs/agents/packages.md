# Published packages

Explore the package you are changing. This file is what to **keep in sync**, not an API reference.

## Protocol

Keep these in lockstep (same paths, same payloads — no duplicate route strings):

1. `@dimah-s3/core` — route constants and limits, types, the error catalog, `createS3Client`; the Zod schemas in `@dimah-s3/core/schema`, which the root never imports
2. `@dimah-s3/server` — operations and their `createS3Endpoint` handlers. The HTTP router is internal; do not export it.
3. `@dimah-s3/react` — hooks, the engine, and React `createS3Client`

Upload keys are server-owned: core upload / multipart-init schemas must not take a client `key`. Confirm size and type from HeadObject, not the presign body.

Presign and multipart init return a signed upload `ticket`. Confirm and every later multipart call send only `{ ticket }`; the server reads the key, upload id, declared file and part layout from it. Do not add a follow-up call that trusts a client key or upload id.

Wire and server-context file fields are `name` / `size` / `type`. React props, options and stored records use `fileName` / `fileSize` / `contentType`. A listed object is `name` / `size` / `contentType`: `ObjectListFile` in react, and the `db()` rows and the `DbClientObject` that mirrors them.

Client extras are `clientMetadata` everywhere: the wire body, the client option and the hook contexts. `metadata` is the object's S3 user metadata, never the client's.

One word per thing across packages. An option in milliseconds ends in `Ms` (`baseDelayMs`); server options in seconds follow AWS and have no suffix (`expiresIn`). A hook context is told apart by `operation`, not by a second field.

Every `S3Api` method takes `(payload, options?)`. In the browser `options` is `{ signal, headers }`; on the server `s3.api` takes `{ headers, request, locals }`. Keep `s3.api` the same shape as the browser client.

Changelog prose: [changelog.md](./changelog.md). Version bump and publish: [release.md](./release.md).

## Endpoint

1. Put the logic in `packages/server/src/operations/` so `s3.api` and HTTP share it. The HTTP handler only reads its input and calls the operation.
2. Add the path to `S3_API_ROUTES` in core, the handler to `api/core-endpoints.ts` under the same name, and the method to `operations/s3-api.ts`.
3. Extend hook context types in `types/hook-contexts.ts` if the endpoint runs consumer hooks. Every context carries `operation` and `locals`.
4. Gate with the route feature flags already used by the open-route helpers. Disabled features stay registered and return `FEATURE_DISABLED`.
5. Auth and side effects belong in consumer `guard` / `on*` hooks, not new library auth.
6. Body endpoints (`POST`, `PUT`, `PATCH`) accept JSON only (`createS3Endpoint` sets `allowedMediaTypes`). Bodies are capped by `maxRequestBodySize`.
7. A new way to start an upload runs `upload.object()` and `upload.guard`, then `upload.onStart({ kind, ... })` with a new `kind`, the way presign, multipart init and `s3.put` do. A browser upload returns a ticket from `issueTicket` (`helpers/ticket.ts`), and every follow-up call verifies it. Add the `kind` to `UploadKind`.

Reuse helpers already in `packages/server/src/helpers/` (keys, constraints, HeadObject, tickets, part layout). Do not reimplement them.

New HTTP adapter: add it next to existing files in `packages/server/src/adapters/`, export from `package.json`, prefer structural types (no framework peer deps). Stream the body and abort the S3 call on disconnect, as the Node adapters do. Public entry stays `dimahS3(config)`.

## Plugin

Contract and merge live in `packages/server/src/plugin/`. Feature plugins (like `db()`) live in their own package and peer-depend on server.

The plugin SDK is public and follows semver: `@dimah-s3/server/plugins`, `@dimah-s3/server/testing`, and the plugin exports of core (`defineClientPlugin`, `pluginPath`, `defineErrorCodes`, `s3Error`). [`examples/plugin-audit`](../../examples/plugin-audit) builds against those exports only, and CI builds and tests it. Keep it passing: a change that breaks it breaks third-party plugins.

- HTTP: `createS3Endpoint` from `@dimah-s3/server/plugins` + shared `pluginPath` from core. Do not export raw better-call `createEndpoint`. Plugin endpoints are HTTP only; they do not appear on `s3.api`. Every path sits under `/{id}`; `applyPlugins` rejects any other.
- Name an endpoint after the client action that calls it. The key is `plugin.action` in the guard context.
- Client: `defineClientPlugin` in core, with `$InferServerPlugin` so `$fetch` is typed by the server endpoints (structural types only; core never imports server). React apps use `createS3Client` from `@dimah-s3/react`. Keep ORM off the client entry.
- Merge once in `dimahS3()` — never inside an endpoint.
- Expose data on `plugin.context` (`s3.context[id]` / flattened `s3[id]`). Do not hardcode per-plugin fields on `DimahS3`.
- Read routes from `env.routes` (resolved client, bucket, `keyPrefix`, limits), not `env.config.routes`. Do not re-derive defaults in a plugin.
- A context method that acts for a caller runs through `env.runOperation`, so every guard runs (instance, then route) and failures pass the error boundary. Never call user guards directly from a plugin.
- Every plugin call is `operation: "plugin"` with `plugin: { id, action }`. Do not add a plugin's name to `S3Operation`.
- Plugin error codes: `defineErrorCodes` under `$ERROR_CODES`, thrown with `s3Error(entry, params)`, merged into `s3.$ERROR_CODES` and the client's. First-party codes that react words (`FOLDER_*`, `OBJECT_EXISTS`) stay in the core catalog.
- Hook order is load-bearing: guards run instance → route → feature, and within each, **plugins first, then the user**. Lifecycle **`on*`** hooks also run plugins first, so user hooks see consistent db state.
- A plugin may bind tickets to a caller with `hooks.ticketSubject`.
- A plugin that grants access without a session (share links) sends bytes with `env.download.presign` / `env.download.serve`, picked by `route.download.mode`, and signs any grant it puts in a URL with `env.tokens(purpose)`. Never presign with `route.client` directly: it skips `inlineTypes` and the `/file` hardening headers.
- A plugin built on db resolves callers and checks ownership through `s3.db.access` (from `env.getPlugin("db")`), so the user's `resolveScope` and `authorize` stay the only source of truth.
- A plugin that records an upload in `upload.onStart` undoes it in `upload.onRejected`, which runs once the server refused the upload and deleted its object. A throw there is reported, never returned.
- Test plugins with `@dimah-s3/server/testing` (`createTestInstance`). The in-memory S3 lives in `packages/server/src/testing/`; the internal harness wraps it.

## db schema

The `@dimah-s3/db` schema lives in one place: `dbSchema` in `src/schema/schema.ts`, version `2.3.0`. Indexes, MySQL prefix lengths (`length`), and collations (`collate`) are declared there, not in custom `up` SQL. The package ships no Drizzle, Prisma, or SQL copies: users generate them with `runCli` → `generate`, and Kysely users create the tables with `migrate`. Every write of an object or folder `name` sets `search_name` with `toSearchName`, which caps it at `SEARCH_NAME_MAX_BYTES`; the name sort and its list cursor read that value. The package does not migrate a database at another version.

Since 2.0.0, databases created at `2.3.0` hold users' data. A table change breaks every one of them, so it ships only in a major release, with the steps that move a database from the previous version.

1. Replace `dbSchema` in `src/schema/schema.ts` (`DB_SCHEMA_VERSION` follows it).
2. Run `pnpm db:generate` in `examples/with-db` (`src/generate.test.ts` fails until `db/dimah-s3.ts` matches).
3. `src/schema/schema.test.ts` and the store tests must pass. The store tests run on Kysely and on Drizzle with the generated schema, on SQLite and PostgreSQL.
4. List the schema change under `#### Breaking changes` in a `major` db changelog, and write the upgrade from the previous version on the docs upgrade page (`apps/docs/content/docs/(framework)/db/upgrade.mdx`).

## React hook

Add it next to existing hooks. Fetch only through `S3Api` from core.

Public hooks that hit the API take a typed `route` (`S3RouteName` — augment `DimahS3Routes`). Wired UI receives the hook return; it does not call the hook. Upload does not take a client object key.

- Keep state per key in the operation store. A second call for a key in flight joins it. Actions return an outcome or result object.
- Every client error is an `APIError` built with `s3Error`; aborts reject with a `DOMException`.
- Whether a failure is sent again is decided in one place, `isRetryableError` (`upload/retry.ts`). The server keeps an upload it could not confirm, so a `5xx` must never abort a stored multipart upload.
- After-callbacks (`onSuccess`, `onError`, `onSettled`) read the newest render's options. No `crypto.randomUUID()`: it is missing on plain-HTTP origins.
- Export hooks and types from `src/index.ts` (the `"use client"` entry). Plain functions go in `src/engine.ts` (`@dimah-s3/react/engine`), which must not import React. Do not re-export anything from core.

## Strings and errors

- React / UI: `t()` / `useTranslations()` from `@fuma-translate/react` (do not re-export). Then `pnpm --filter @dimah-s3/react compile:translations`. Formatters that map codes to copy must call `useTranslations()` themselves; a new catalog code needs a case in `useFormatError`.
- Codes live in `S3_ERROR_CODES` (`packages/core/src/error-codes.ts`): each entry has a `status`, an English message template filled from typed `params`, and `client: true` when only the browser raises it. Name codes noun first (`UPLOAD_TICKET_INVALID`). First-party plugin codes (`FOLDER_*`, `OBJECT_EXISTS`) live there too, so react can word them. `CONFLICT` means a concurrent change won; use a specific code for a state the user must change.
- Throw `s3Error(code, params)`; plugin-only codes use `APIError.from(status, { code, message })`. Detect with `isS3ErrorCode(error, code)`. Do not add a custom HTTP serializer — throw and let the error boundary build the response. Config problems are logged and return `500 INTERNAL_ERROR`.

## Build

Each package: `tsup` → `dist/`. New public path → `package.json` `exports`. Shared configs live in `tooling/`. Client entries get `"use client"` from `packageConfig({ clientEntries })`, never from a source banner.

After `pnpm build`, `pnpm check:dist` checks that every `exports` path exists and declares its runtime exports, that `"use client"` starts only the react and ui `dist/index.js`, that `@dimah-s3/react/engine` imports no React, that the `@dimah-s3/core` root imports no Zod, that exact `@dimah-s3/*` peers match the current version, and that every relative import in a `.d.ts` names its `.js` path (consumers on `moduleResolution: NodeNext` read the declarations as ES modules). Library builds add those extensions with `tooling/tsup-config/dts-extensions.mjs` after `tsc-alias`.

`packages/react/api-report.md` and `packages/ui/api-report.md` list the public declarations of those packages, without comments. After a change to a public type, prop, signature or translation key, run `pnpm build && pnpm api:report` and commit the report with the change; CI runs `pnpm api:report --check`. Read the report diff as the API change a consumer sees.

## Done

- [ ] Behavior sits in the owning package ([architecture.md](./architecture.md))
- [ ] Protocol change updated core, server, and react together
- [ ] Types exported; a breaking change is listed under `#### Breaking changes` in a Tegami changelog
- [ ] `pnpm build && pnpm check-types && pnpm lint && pnpm test && pnpm check:dist` pass
- [ ] `pnpm api:report` is committed when the react or ui public API changed
