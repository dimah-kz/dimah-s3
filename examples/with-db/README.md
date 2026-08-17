# examples/with-db

Same as [`examples/with-nextjs`](../with-nextjs) / [`templates/nextjs`](../../templates/nextjs), plus **`@dimah-s3/db`** (Drizzle + SQLite) — matching the [Database setup](https://dimah-s3.vercel.app/docs/db/setup) guide.

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

## What's wired

Shared with the Next.js starter:

1. [src/lib/s3.ts](src/lib/s3.ts) — `awsS3` + `dimahS3(...)` (upload/download/delete + `db()`)
2. [src/lib/s3-client.ts](src/lib/s3-client.ts) — `createS3Client({ plugins: [dbClient()] })` + `S3Provider`
3. [src/app/api/s3/[...s3]/route.ts](src/app/api/s3/[...s3]/route.ts) — Next.js adapter
4. [src/app/layout.tsx](src/app/layout.tsx) — `S3Provider` + `Toaster`
5. [src/app/page.tsx](src/app/page.tsx) — `UploadButton`

DB delta only:

1. [src/lib/db.ts](src/lib/db.ts) + [src/lib/dimah-s3-db.ts](src/lib/dimah-s3-db.ts) — Drizzle + FumaDB client
2. `plugins: [db({ client, resolveScope })]` in [src/lib/s3.ts](src/lib/s3.ts)
3. `plugins: [dbClient()]` in the provider
4. [src/components/file-list.tsx](src/components/file-list.tsx) — `api.db.listObjects`

Demo scope is hard-coded to `user:demo`. Swap `resolveScope` for your auth session when you wire a real app.

## Scripts

| Script                | Description                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm db:schema`      | `dimah-s3-db generate latest` → `db/dimah-s3.ts`                                                     |
| `pnpm db:push`        | Push schema to SQLite (`DATABASE_PATH`, default `./local.db`)                                        |
| `pnpm db:cli`         | Interactive FumaDB CLI                                                                               |
| `pnpm db:purge-stale` | Optional — purge stale pending + abort multipart ([docs](https://dimah-s3.vercel.app/docs/db/purge)) |
