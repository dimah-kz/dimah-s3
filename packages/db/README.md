# @dimah-s3/db

Optional database plugin for [dimah-s3](https://github.com/dimah-kz/dimah-s3). It tracks each upload in a `storage_object` table, binds uploads to the caller's scope, and adds logical folders, listings, and quotas.

**Docs:** [Database Setup](https://s3.dimah.dev/docs/db/setup) · [Lifecycle Hooks](https://s3.dimah.dev/docs/db/lifecycle-hooks) · [API](https://s3.dimah.dev/docs/db/api) · [Purge](https://s3.dimah.dev/docs/db/purge) · [llms.txt](https://s3.dimah.dev/llms.txt) · **Example:** [`examples/with-db`](../../examples/with-db)

## Install

```bash
pnpm add @dimah-s3/db @dimah-s3/server
```

You do not install `fumadb`: the adapters ship from `@dimah-s3/db/adapters/*`.

## Tables

Create the schema with one of:

- Drizzle: add `dimahS3Tables` from `@dimah-s3/db/drizzle/{sqlite,pg,mysql}` to your Drizzle schema.
- Prisma: copy [`prisma/dimah-s3.prisma`](./prisma/dimah-s3.prisma) into your schema.
- Plain SQL: run [`sql/<dialect>.sql`](./sql).
- Kysely: call `migrate(client)` from `@dimah-s3/db/cli`. It steps one schema version at a time, so the indexes are created too. The FumaDB CLI from `runCli` does the same only with `migrate:up`; its `migrate` command jumps straight to the latest schema and skips them.

Upgrading from 1.x: run `sql/upgrade/1.0.0-2.0.0/<dialect>.sql`, or `migrate(client)` with Kysely. A database at an older schema throws on the first query; call `s3.db.checkSchema()` at startup to fail fast.

## Server

```ts
import { DimahS3DB, db } from "@dimah-s3/db";
import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
import { dimahS3, route } from "@dimah-s3/server";

export const s3 = dimahS3({
  client: awsS3,
  bucket: process.env.S3_BUCKET!,
  plugins: [
    db({
      client: DimahS3DB.client(
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

await s3.db.objects.list({ scope: "user:1", folder: null });
await s3.db.purgeStale();
```

- `resolveScope` returns the owner of the request, or `null` to reject it with `UNAUTHORIZED`.
- `authorize` runs after it and returns `false` to reject with `FORBIDDEN`.
- `quota` is checked at upload and again with the verified size at confirm.
- `plugins: { db: false }` on a route turns tracking off. `plugins: { db: { replace: "overwrite" } }` lets an upload replace an active object at the same key; the object stays listed and downloadable until the new upload is confirmed.

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

`dbObjectSource` lists one folder at a time. Uploads go to the open folder, and "New folder" calls `api.db.createFolder`. Pass `folders: false` for a flat list.

`api.db` also has `getObject`, `updateObject` (rename, move, or set `attributes`), and `deleteFolder`.

## License

MIT
