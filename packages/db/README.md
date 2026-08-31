# @dimah-s3/db

Optional FumaDB persistence for [dimah-s3](https://github.com/dimah-kz/dimah-s3) — `storage_object` table via the `db()` plugin.

**Docs:** [Setup](https://dimah-s3.vercel.app/docs/db/setup) · [Hooks](https://dimah-s3.vercel.app/docs/db/hooks) · [llms.txt](https://dimah-s3.vercel.app/llms.txt) · **Example:** [`examples/with-db`](../../examples/with-db)

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
      download: true,
      delete: true,
    }),
  },
});

s3.db.objects.listByScope({ scope });
```

Copy-paste schemas (with indexes): [`drizzle.ts`](./src/schema/examples/drizzle.ts) · [`schema.prisma`](./src/schema/examples/schema.prisma)
