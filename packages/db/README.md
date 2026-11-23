# @dimah-s3/db

Optional database plugin for [dimah-s3](https://github.com/dimah-kz/dimah-s3). It tracks each upload in a `storage_object` table, binds uploads to the caller's scope, and adds logical folders, listings, and quotas. A folder belongs to a scope, not to a route.

**Docs:** [Database Setup](https://s3.dimah.dev/docs/db/setup) · [Lifecycle Hooks](https://s3.dimah.dev/docs/db/lifecycle-hooks) · [API](https://s3.dimah.dev/docs/db/api) · [Purge](https://s3.dimah.dev/docs/db/purge) · [llms.txt](https://s3.dimah.dev/llms.txt) · **Example:** [`examples/with-db`](../../examples/with-db)

## Install

```bash
pnpm add @dimah-s3/db @dimah-s3/server
```

You do not install `fumadb`: the adapters ship from `@dimah-s3/db/adapters/*`, and the FumaDB CLI from `@dimah-s3/db/cli`. `@aws-sdk/client-s3` is the one your server already has. With Drizzle, the package needs `drizzle-orm` 1.0.0-rc.5 or later.

## Tables

`runCli(client)` from `@dimah-s3/db/cli` runs the FumaDB CLI for this schema:

- Drizzle or Prisma: `generate` writes the tables or models, with the indexes and the MySQL prefix lengths and collations. Apply them with `drizzle-kit` or Prisma Migrate. Generating does not connect to the database.
- Kysely: `migrate` creates the tables and the indexes, and so does `migrate(client)` from `@dimah-s3/db`.

```ts
// scripts/dimah-s3.ts — npx tsx scripts/dimah-s3.ts generate latest -o db/dimah-s3.ts
import { DimahS3Db } from "@dimah-s3/db";
import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
import { runCli } from "@dimah-s3/db/cli";

await runCli(
  DimahS3Db.client(drizzleAdapter({ db: undefined, provider: "sqlite" })),
);
```

The package reads schema `2.3.0` and does not upgrade a database at another version, 1.x included: create the tables on a new database. The first query checks the recorded version and reads one row of each table, so a database at another version, or one the schema was never applied to, throws there. Call `s3.db.checkSchema()` at startup to fail fast.

## Server

```ts
import { DimahS3Db, db } from "@dimah-s3/db";
import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
import { dimahS3, route } from "@dimah-s3/server";

export const s3 = dimahS3({
  client: awsS3,
  bucket: process.env.S3_BUCKET!,
  plugins: [
    db({
      client: DimahS3Db.client(
        drizzleAdapter({ db: drizzleDb, provider: "sqlite" }),
      ),
      getSession: (request) => auth.getSession(request),
      resolveScope: ({ session }) =>
        session ? `user:${session.userId}` : null,
      quota: { maxBytes: 1024 ** 3, maxFiles: 1000 },
    }),
  ],
  routes: {
    uploads: route({ upload: true, download: true, delete: true }),
  },
});

await s3.db.objects.list("user:1", { folderId: null });
await s3.db.purgeStale();
```

- `resolveScope` returns the owner of the request, or `null` to reject it with `UNAUTHORIZED`.
- `authorize` runs after it and returns `false` to reject with `FORBIDDEN`. It sees the folder the target is in (`folder`, `folderId`) and, for a move or a new folder, where it goes (`destination`).
- `quota` caps bytes and files, checked at upload and again with the verified size at confirm, and folders (`maxFolders`), checked when one is created.
- `plugins: { db: false }` on a route turns tracking off. `plugins: { db: { replace: "overwrite" } }` lets an upload replace an active object at the same key. The row stays listed while the upload is in flight; the bytes at the key are the new ones as soon as the upload lands.

## Browser

```ts
import { dbClient, dbObjectSource } from "@dimah-s3/db/client";
import { createS3Client, useObjectList } from "@dimah-s3/react";

export const s3Client = createS3Client({ plugins: [dbClient()] });

const list = useObjectList({
  ...dbObjectSource(s3Client.db, { route: "uploads" }),
  queryKey: ["uploads"],
});
```

`dbObjectSource` lists one folder at a time. Uploads go to the open folder, and "New folder" calls `api.db.createFolder`. Rename calls `updateObject` or `updateFolder` with the new `name` and leaves the object key as it is. Pass `folders: false` for a flat list; file rename stays available. The usage line shows when the plugin sets a `quota`, or with `usage: true`.

`api.db` also has `getObject`, `updateObject` (rename, move, or set `attributes`), and `deleteFolder`.

## License

MIT
