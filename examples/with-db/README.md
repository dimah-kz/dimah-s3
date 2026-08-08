# examples/with-db

Minimal Next.js example: **quickstart setup** plus **`@dimah-s3/db`** (Drizzle + SQLite), matching the [Database setup](https://dimah-s3.vercel.app/docs/db/setup) guide.

For the upload-only baseline without a database, see [`examples/with-nextjs`](../with-nextjs).

## Setup

```bash
cp .env.example .env.local
# fill S3_* vars

pnpm install
pnpm db:schema   # FumaDB CLI → Drizzle schema at db/dimah-s3.ts
pnpm db:push     # apply schema to local.db
pnpm dev
```

Open `/` — upload a file, then see it listed from `storage_object`.

## What's wired (same as the docs)

1. [src/lib/s3-client.ts](src/lib/s3-client.ts) — AWS SDK client (quickstart)
2. [src/lib/db.ts](src/lib/db.ts) + [src/lib/dimah-s3-db.ts](src/lib/dimah-s3-db.ts) — Drizzle + FumaDB client
3. [src/lib/s3.ts](src/lib/s3.ts) — `plugins: [db({ client, resolveScope })]`
4. [src/components/s3-provider.tsx](src/components/s3-provider.tsx) — `dbClient()` for browser listing
5. [src/components/file-list.tsx](src/components/file-list.tsx) — `api.db.listObjects`

Demo scope is hard-coded to `user:demo`. Swap `resolveScope` for your auth session when you wire a real app.

## Scripts

| Script                | Description                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm db:schema`      | `dimah-s3-db generate latest` → `db/dimah-s3.ts`                                                     |
| `pnpm db:push`        | Push schema to SQLite (`DATABASE_PATH`, default `./local.db`)                                        |
| `pnpm db:cli`         | Interactive FumaDB CLI                                                                               |
| `pnpm db:purge-stale` | Optional — purge stale pending + abort multipart ([docs](https://dimah-s3.vercel.app/docs/db/purge)) |
