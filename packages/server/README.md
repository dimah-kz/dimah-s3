# @dimah-s3/server

Presigned S3 upload, download, and delete handlers with route policies,
guards, and lifecycle hooks. One instance gives you an HTTP `handler`, an
in-process `api`, and `put` for server-side uploads.

Full documentation: [s3.dimah.dev/docs/server](https://s3.dimah.dev/docs/server) ·
[llms.txt](https://s3.dimah.dev/llms.txt)

## Install

```bash
pnpm add @dimah-s3/server @aws-sdk/client-s3
```

Set the upload ticket secret, at least 32 characters and the same on every
instance:

```bash
# .env — generate with: openssl rand -base64 32
DIMAH_S3_SECRET="…"
```

## Minimal setup

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { dimahS3, route } from "@dimah-s3/server";

export const awsS3 = new S3Client({
  region: process.env.S3_REGION,
  // Required: presigned browser uploads cannot match SDK checksums.
  requestChecksumCalculation: "WHEN_REQUIRED",
});

export const s3 = dimahS3({
  client: awsS3,
  bucket: process.env.S3_BUCKET!,
  routes: {
    uploads: route({
      upload: { fileTypes: ["image/*"], maxFileSize: 5 * 1024 * 1024 },
      download: true,
      delete: true,
    }),
  },
});
```

Mount it with a framework adapter:

```ts
// Next.js: app/api/s3/[...s3]/route.ts
import { toNextJsHandler } from "@dimah-s3/server/next";
export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(s3);

// Express   — @dimah-s3/server/express    → toExpressHandler
// Hono      — @dimah-s3/server/hono       → toHonoHandler
// Fastify   — @dimah-s3/server/fastify    → toFastifyHandler
// Elysia    — @dimah-s3/server/elysia     → toElysiaHandler
// SvelteKit — @dimah-s3/server/svelte-kit → toSvelteKitHandler
// Node http — @dimah-s3/server/node       → toNodeHandler
// Any Fetch runtime: s3.handler(request)
```

See [Server Setup](https://s3.dimah.dev/docs/server/setup) for every adapter.

## Guards and hooks

Guards return nothing to allow, `{ locals }` to pass values on, and throw
`s3Error(code)` to reject:

```ts
import { s3Error } from "@dimah-s3/server";

declare module "@dimah-s3/server" {
  interface DimahS3Locals {
    userId?: string;
  }
}

export const s3 = dimahS3({
  // ...
  guard: async ({ request }) => {
    const session = await getSession(request);
    if (!session) throw s3Error("UNAUTHORIZED");
    return { locals: { userId: session.userId } };
  },
});
```

`upload.onStart` runs once an upload can begin, and `upload.onConfirmed` runs
after HeadObject verifies the stored object. `onConfirmed` runs at least once:
dedupe on `uploadToken`.

## In process

`s3.api` has the browser client's shape, with `{ headers, request, locals }`
last:

```ts
await s3.api.download({ route: "uploads", key }, { headers: await headers() });

await s3.put({ route: "uploads", name: "report.pdf", body: pdfBytes });
```

Optional persistence: add `db()` from [`@dimah-s3/db`](../db) to `plugins`.

## Upgrading from 1.7

See [Upgrade to 1.8](https://s3.dimah.dev/docs/migration-1-8).

## License

MIT
