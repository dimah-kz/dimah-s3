# examples/with-db

A file manager on [`examples/with-nextjs`](../with-nextjs) plus **`@dimah-s3/db`** (Drizzle + SQLite) and **`@dimah-s3/share`**, matching the [Database Setup](https://s3.dimah.dev/docs/db/setup) and [Share Links](https://s3.dimah.dev/docs/share) guides. Files and folders are listed from the database, with search, sort, a usage meter, upload, download, delete, and share links.

## Setup

```bash
cp .env.example .env
# fill S3_* and DIMAH_S3_SECRET

pnpm install
pnpm db:push     # create the tables in local.db
pnpm dev
```

Open `/`. Drop files onto the list or onto a folder, or use **Upload files**. **New folder** creates a folder in the open one. **Share link** in a row's menu copies a 7-day link; open it in a private window to see the page a visitor gets.

Browser uploads need bucket CORS that allows `PUT` from your origin.

Coming from an earlier version of this example: delete `local.db` and run `pnpm db:push` again. The schema is created on a new database, not upgraded.

## What's wired

1. [db/dimah-s3.ts](db/dimah-s3.ts) and [db/dimah-s3-share.ts](db/dimah-s3-share.ts): the Drizzle tables `pnpm db:generate` writes from the `@dimah-s3/db` and `@dimah-s3/share` schemas ([scripts/dimah-s3.mts](scripts/dimah-s3.mts) and [scripts/dimah-s3-share.mts](scripts/dimah-s3-share.mts) run `runCli`). `drizzle-kit push` creates them.
2. [src/lib/db.ts](src/lib/db.ts): one Drizzle instance over better-sqlite3 with the relations of both files, and `DimahS3Db.client(adapter)` and `DimahS3Share.client(adapter)` on it
3. [src/lib/s3.ts](src/lib/s3.ts): `dimahS3({ secret, routes })` with the `files` route, `db({ client, resolveScope, quota })`, and `share({ client, url })`
4. [src/app/api/s3/[...s3]/route.ts](src/app/api/s3/[...s3]/route.ts): Next.js adapter
5. [src/lib/s3-client.ts](src/lib/s3-client.ts): `createS3Client({ plugins: [dbClient(), shareClient()] })` and `S3Provider`
6. [src/app/layout.tsx](src/app/layout.tsx): `S3Provider` and `Toaster`
7. [src/components/file-manager.tsx](src/components/file-manager.tsx): `ObjectList` over `dbObjectSource(api.db, { route: "files" })`, with `useUpload`, `useDownload`, `useDelete`, and a Share link row action (`api.share.createLink`)
8. [src/app/s/[token]/page.tsx](src/app/s/[token]/page.tsx) and [src/components/shared-view.tsx](src/components/shared-view.tsx): the page a link opens, with the password form, `ObjectList` over `shareObjectSource`, and `downloadSharedFile`

Every request uses the scope `user:demo`. Return your session's user from `resolveScope` when you wire a real app. The `quota` caps (100 MB, 100 files) come back with the first page of the list, and the list shows them as a meter.

`s3.ts` creates the instance on first use (`getS3()`), so `next build` runs without the S3 environment.

## Scripts

| Script             | Description                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:generate` | Write `db/dimah-s3.ts` and `db/dimah-s3-share.ts` again, after upgrading `@dimah-s3/db` or `@dimah-s3/share`                                          |
| `pnpm db:push`     | Create or update the tables in SQLite (`DATABASE_PATH`, default `./local.db`)                                                                         |
| `pnpm db:purge`    | Clean up unconfirmed uploads, prune soft-deleted rows and dead share links: `s3.db.purgeStale()`, `s3.db.pruneDeleted()`, and `s3.share.pruneLinks()` |
