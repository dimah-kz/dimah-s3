# Published packages (core / server / react / ui / db)

> Rule: `.cursor/rules/packages.mdc`. **Explore** the target package `src/` for live patterns.

## When changing the presign protocol

1. Types + Zod schemas + `S3_API_ROUTES` in `packages/core/src/` (paths always start with `/`).
2. `createS3Client` in core — same paths as the server router; optional `fetch` / `credentials` / `headers`.
3. Endpoints in `packages/server/src/api/routes/` via `createS3Endpoint`; `dimahS3()` builds `createS3Router` (HTTP `handler` + `s3.api`).
4. React client via `createS3Client` from `@dimah-s3/react` / hooks — no duplicate route strings. Browser `S3Api` stays named (`api.download(key)`); server `s3.api` is the better-call map (`download({ query, headers })`).
5. Tegami changelog — [release.md](./release.md).

## When adding or changing UI / API strings

1. Static `t("…")` / `useTranslations()` from `@fuma-translate/react` in `react` / `ui` (do not re-export the hook). English source text is the default.
2. `pnpm --filter @dimah-s3/react compile:translations` — keep exported `Translations` in sync. Code→string mappers must call `useTranslations()` themselves (`useFormatDimahError`, `useFormatValidateFileError`).
3. Server: `DimahS3Error` + `S3_ERROR_CODES` + English `message` (+ `params`). Prefer `errors.*` in `server/src/errors.ts`.
4. Tegami changelog — [release.md](./release.md).

## When adding or changing a server endpoint

1. `createS3Endpoint` + Zod schema in `api/routes/`; add the export to `coreEndpoints`.
2. Hook context types beside other `types/*-context.ts` files.
3. Feature flags via `DimahS3Config` (`upload`, `download`, `delete`, `multipart`) — disabled → `NOT_FOUND` (endpoint still registered).
4. `guard` / `*Guard` / `on*` hooks for consumer auth and side effects only.
5. Public entry: `dimahS3(config)` → `{ handler, api, context, getPlugin }` + flattened plugin contexts (`s3[id]`); mount via adapters in `packages/server/src/adapters/` (`toNextJsHandler`, `toExpressHandler`, `toHonoHandler`, …). Next adapter exposes GET/POST/PUT/PATCH/DELETE. New adapter → add file + `package.json` `exports` + `tsup` entry; prefer structural framework types (no peer deps).

## When adding or changing a server plugin

1. Plugin subsystem lives in `packages/server/src/plugin/` (`DimahS3Plugin`, `definePlugin`, `applyPlugins`, `chainHooks`, `FEATURE_HOOK_KEYS`). Endpoints use `createS3Endpoint` from `@dimah-s3/server` / `@dimah-s3/server/api`.
2. Author plugins with `definePlugin({ id, hooks?, endpoints?, context?, dependsOn?, init? })` so literal ids infer onto `s3.context[id]` / flattened `s3[id]`.
3. HTTP endpoints use `createS3Endpoint` with an absolute path under `basePath` (e.g. `/db/objects`) via `pluginPath` from `@dimah-s3/core` (shared with the client). Never duplicate route strings. Do not export raw better-call `createEndpoint`.
4. Pair browser access with `createS3Client({ plugins })` from `@dimah-s3/react` (returns typed `api` + bound `S3Provider` / `useApi`) or the same helper from `@dimah-s3/core` for fetch-only. Client plugins implement `getActions($fetch)` + `$InferServerPlugin`. Ship light `@pkg/client` entries from feature packages so ORM deps stay server-only.
5. Feature plugins live in their packages (e.g. `db()` / `dbClient()` in `@dimah-s3/db`) and peer-depend on `@dimah-s3/server` (client entry depends on `@dimah-s3/core` only).
6. Merge once in `dimahS3()` — validate ids / `dependsOn` / reserved keys / endpoint collisions, run `init`, then chain hooks (plugins first in array order, user hooks last). Never merge inside endpoints.
7. Expose data on `plugin.context` — consumers read `s3.context[id]` or the flattened `s3[id]` (e.g. `s3.db`). Do **not** hardcode per-plugin fields on `DimahS3`.
8. Tegami changelog — [release.md](./release.md).

## When adding or changing a React hook

1. Hook in `packages/react/src/hooks/`.
2. Upload mechanics in `upload/`; shared helpers in `helpers/`.
3. Depend on `@dimah-s3/core` only — fetch through `S3Api`, not ad-hoc URLs.
4. Export from `src/index.ts` when public.

## Build & exports

- `pnpm build` / `pnpm check-types` / `pnpm lint` from repo root (Turbo).
- Shared configs: `@workspace/eslint-config` and `@workspace/typescript-config` in `tooling/` (each package extends them).
- Each package: `tsup` → `dist/`; declare new public paths in `package.json` `exports`.
- `server` peerDep: `@aws-sdk/client-s3`; `react` peerDep: `react`; `db` peerDep: `@dimah-s3/server`.

## Definition of done

- [ ] Placement respected — [architecture.md](./architecture.md#placement).
- [ ] Protocol SSOT updated in core when routes or payloads change.
- [ ] Types exported; no breaking rename without major Tegami changelog.
- [ ] `pnpm build && pnpm check-types && pnpm lint && pnpm test` pass.
