# examples/with-db

Next.js example with **@dimah-s3/db** — Drizzle + SQLite via the `db()` plugin.

Docs: [Database setup](https://dimah-s3.dev/docs/db/setup).

## Setup

```bash
cp .env.example .env.local
# fill S3_* vars

pnpm install
pnpm db:schema   # FumaDB CLI → Drizzle schema at db/dimah-s3.ts
pnpm db:push     # apply schema to local.db
pnpm dev
```

Open `/dashboard` for uploads plus a DB-backed file list.

## What's wired

- [src/lib/s3.ts](src/lib/s3.ts) — `db({ client: dimahS3Db })` + quota; use `s3.db.objects` everywhere
- [src/lib/storage/scope.ts](src/lib/storage/scope.ts) — demo scope resolver
- [src/components/s3-provider.tsx](src/components/s3-provider.tsx) — `createS3Client({ plugins: [dbClient()] })` for browser listing
- [scripts/purge-stale-pending.mts](scripts/purge-stale-pending.mts) — purge stale pending + abort multipart

## Scripts

| Script                | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `pnpm db:schema`      | `dimah-s3-db generate latest` → `db/dimah-s3.ts`            |
| `pnpm db:push`        | Push schema to SQLite (`DATABASE_PATH`, default `./local.db`) |
| `pnpm db:cli`         | Interactive FumaDB CLI                                        |
| `pnpm db:purge-stale` | Purge stale pending rows + abort multipart uploads            |
