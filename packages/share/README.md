# @dimah-s3/share

Share links for [dimah-s3](https://github.com/dimah-kz/dimah-s3), on top of [`@dimah-s3/db`](../db). An owner creates a link to one file or one folder of their scope; anyone who holds it can open it, browse the folder, and download files without a session, until it expires, reaches its download limit, or the owner revokes it. A link can need a password.

**Docs:** [Share Links](https://s3.dimah.dev/docs/share) · [The Shared Page](https://s3.dimah.dev/docs/share/visitor-page) · [API](https://s3.dimah.dev/docs/share/api) · **Example:** [`examples/with-db`](../../examples/with-db)

## Install

```bash
pnpm add @dimah-s3/share
```

It needs `@dimah-s3/db` and `@dimah-s3/server` at the same version. Use the adapters from `@dimah-s3/db/adapters/*`.

## Table

`runCli(client)` from `@dimah-s3/share/cli` runs the FumaDB CLI for the `share_link` table: `generate` writes it for Drizzle or Prisma, and `migrate(client)` creates it with Kysely.

```ts
// scripts/dimah-s3-share.ts — npx tsx scripts/dimah-s3-share.ts generate latest -o db/dimah-s3-share.ts
import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
import { DimahS3Share } from "@dimah-s3/share";
import { runCli } from "@dimah-s3/share/cli";

await runCli(
  DimahS3Share.client(drizzleAdapter({ db: undefined, provider: "sqlite" })),
);
```

## Server

```ts
import { db } from "@dimah-s3/db";
import { dimahS3, route } from "@dimah-s3/server";
import { DimahS3Share, isSharePublicAction, share } from "@dimah-s3/share";

export const s3 = dimahS3({
  client: awsS3,
  bucket: process.env.S3_BUCKET!,
  guard: async (context) => {
    // Visitors hold a link, not a session.
    if (isSharePublicAction(context)) return;
    await requireSession(context.request);
  },
  plugins: [
    db({ client: dimahS3Db, getSession, resolveScope }),
    share({
      client: DimahS3Share.client(adapter),
      url: (token) => `https://app.example.com/s/${token}`,
      expiration: { default: 7 * 86_400, max: 30 * 86_400 },
    }),
  ],
  routes: { files: route({ upload: true, download: true, delete: true }) },
});
```

## Browser

```ts
import { dbClient } from "@dimah-s3/db/client";
import { createS3Client } from "@dimah-s3/react";
import { shareClient } from "@dimah-s3/share/client";

export const s3Client = createS3Client({
  plugins: [dbClient(), shareClient()],
});

// Owner
const { link } = await s3Client.share.createLink({
  target: { type: "folder", folderId },
  password: "correct horse",
  maxDownloads: 20,
});

// Visitor, on the page `link.url` opens
const { access } = await s3Client.share.unlockLink({ token, password });
const page = await s3Client.share.listShared({ token, access });
const { url } = await s3Client.share.downloadShared({
  token,
  access,
  id: page.objects[0].id,
});
```

`shareObjectSource(s3Client.share, { token, access })` lists a shared folder in `ObjectList`.

## License

MIT
