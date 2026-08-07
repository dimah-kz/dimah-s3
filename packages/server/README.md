# @dimah-s3/server

Presigned S3 handlers with HTTP `handler`, direct `api`, and an optional `plugins` array.

Full documentation: [dimah-s3.vercel.app](https://dimah-s3.vercel.app/docs/server)

## Install

```bash
pnpm add @dimah-s3/server @aws-sdk/client-s3
```

## Minimal setup

```ts
import { dimahS3 } from "@dimah-s3/server";
import { s3Client, defaultBucket } from "@/lib/s3-client";

export const s3 = dimahS3({
  s3: s3Client,
  defaultBucket,
  upload: { enabled: true },
  download: { enabled: false },
  delete: { enabled: false },
  multipart: { enabled: false },
});
```

```ts
import { toNextJsHandler } from "@dimah-s3/server/next";
import { s3 } from "@/lib/s3";

export const { GET, POST, DELETE } = toNextJsHandler(s3);
```

Server-side (no HTTP):

```ts
await s3.api.download(key, { headers: await headers() });
```

Optional persistence: add `db()` from [`@dimah-s3/db`](../db) to `plugins`.

## License

MIT
