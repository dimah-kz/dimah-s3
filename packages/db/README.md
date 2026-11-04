# @dimah-s3/db

**1.x.** New projects should use the [2.0 beta](https://s3.dimah.dev/docs/db) (`npm i @dimah-s3/db@beta`).

Optional FumaDB persistence for [dimah-s3](https://github.com/dimah-kz/dimah-s3) — `storage_object` table via the `db()` plugin.

**Docs:** [Database Setup](https://v1.s3.dimah.dev/docs/db/setup) · [Database Lifecycle Hooks](https://v1.s3.dimah.dev/docs/db/lifecycle-hooks) · [llms.txt](https://v1.s3.dimah.dev/llms.txt) · **Example:** [`examples/with-db`](../../examples/with-db)

```ts
import { DimahS3DB, db } from "@dimah-s3/db";
import { dimahS3, route } from "@dimah-s3/server";
import { drizzleAdapter } from "fumadb/adapters/drizzle";

export const dimahS3Db = DimahS3DB.client(
  drizzleAdapter({ db: drizzleDb, provider: "sqlite" }),
);

export const s3 = dimahS3({
  client: awsS3,
  bucket: process.env.S3_BUCKET!,
  plugins: [
    db({
      client: dimahS3Db,
      resolveScope: async (request) => {
        const session = await getSession(request);
        return session ? `user:${session.userId}` : null;
      },
    }),
  ],
  routes: {
    uploads: route({
      upload: true,
    }),
  },
});

s3.db.objects.listByScope({ scope });
```

Copy-paste schemas (with indexes): [`drizzle.ts`](./src/schema/examples/drizzle.ts) · [`schema.prisma`](./src/schema/examples/schema.prisma)
