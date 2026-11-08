# examples/with-db

A file manager on [`examples/with-nextjs`](../with-nextjs) plus **`@dimah-s3/db`** (Drizzle + SQLite), matching the [Database Setup](https://s3.dimah.dev/docs/db/setup) guide. Files and folders are listed from the database, with search, sort, a usage meter, upload, download, and delete.

## Setup

```bash
cp .env.example .env
# fill S3_* and DIMAH_S3_SECRET

pnpm install
pnpm db:push     # create the tables in local.db
pnpm dev
```

Open `/`. Drop files onto the list or onto a folder, or use **Upload files**. **New folder** creates a folder in the open one.

Browser uploads need bucket CORS that allows `PUT` from your origin.

Coming from the 1.x example: delete `local.db` and run `pnpm db:push` again.

## What's wired

1. [db/dimah-s3.ts](db/dimah-s3.ts): the Drizzle tables `pnpm db:generate` writes from the `@dimah-s3/db` schema ([scripts/dimah-s3.mts](scripts/dimah-s3.mts) runs `runCli`). `drizzle-kit push` creates them.
2. [src/lib/db.ts](src/lib/db.ts): Drizzle over better-sqlite3, and `DimahS3DB.client(drizzleAdapter(…))` from `@dimah-s3/db/adapters/drizzle`
3. [src/lib/s3.ts](src/lib/s3.ts): `dimahS3({ secret, routes })` with the `files` route and `db({ client, resolveScope, quota })`
4. [src/app/api/s3/[...s3]/route.ts](src/app/api/s3/[...s3]/route.ts): Next.js adapter
5. [src/lib/s3-client.ts](src/lib/s3-client.ts): `createS3Client({ plugins: [dbClient()] })` and `S3Provider`
6. [src/app/layout.tsx](src/app/layout.tsx): `S3Provider` and `Toaster`
7. [src/components/file-manager.tsx](src/components/file-manager.tsx): `ObjectList` over `dbObjectSource(api.db, { route: "files" })`, with `useUpload`, `useDownload`, and `useDelete`

Every request uses the scope `user:demo`. Return your session's user from `resolveScope` when you wire a real app. The `quota` caps (100 MB, 100 files) come back with the first page of the list, and the list shows them as a meter.

`s3.ts` creates the instance on first use (`getS3()`), so `next build` runs without the S3 environment.

## Scripts

| Script             | Description                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm db:generate` | Write `db/dimah-s3.ts` again, after upgrading `@dimah-s3/db`                                                                                           |
| `pnpm db:push`     | Create or update the tables in SQLite (`DATABASE_PATH`, default `./local.db`)                                                                          |
| `pnpm db:purge`    | Clean up unconfirmed uploads and prune soft-deleted rows: `s3.db.purgeStale()` and `s3.db.pruneDeleted()` ([docs](https://s3.dimah.dev/docs/db/purge)) |
