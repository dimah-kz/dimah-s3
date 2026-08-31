# @dimah-s3/server

Presigned S3 handlers with HTTP `handler`, direct `api`, and an optional `plugins` array.

Full documentation: [dimah-s3.vercel.app/docs/server](https://dimah-s3.vercel.app/docs/server) ·
[llms.txt](https://dimah-s3.vercel.app/llms.txt)

## Install

```bash
pnpm add @dimah-s3/server @aws-sdk/client-s3
```

## Minimal setup

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { dimahS3, route } from "@dimah-s3/server";

export const awsS3 = new S3Client({/* env */});

export const s3 = dimahS3({
  client: awsS3,
  bucket: process.env.S3_BUCKET!,
  routes: {
    uploads: route({
      upload: { fileTypes: ["image/*"] },
    }),
  },
});
```

Mount with a framework adapter:

```ts
// Next.js
import { toNextJsHandler } from "@dimah-s3/server/next";
export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(s3);

// Express — @dimah-s3/server/express → toExpressHandler
// Hono    — @dimah-s3/server/hono → toHonoHandler
// Fastify — @dimah-s3/server/fastify → toFastifyHandler
// Elysia  — @dimah-s3/server/elysia → toElysiaHandler
// SvelteKit — @dimah-s3/server/svelte-kit → toSvelteKitHandler
// Node http — @dimah-s3/server/node → toNodeHandler
```

See [Server setup](https://dimah-s3.vercel.app/docs/server/setup) for full examples.

Server-side (no HTTP):

```ts
await s3.api.download({ query: { route, key }, headers: await headers() });
```

Optional persistence: add `db()` from [`@dimah-s3/db`](../db) to `plugins`.

## License

MIT
