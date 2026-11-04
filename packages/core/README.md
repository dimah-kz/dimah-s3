# @dimah-s3/core

**2.0 beta.** Install with `@beta`. `@latest` stays on 1.x ([v1.s3.dimah.dev](https://v1.s3.dimah.dev/docs)), and betas can include breaking changes until 2.0.0.

The protocol, typed fetch client, error catalog, and pure helpers shared by
`@dimah-s3/server` and `@dimah-s3/react`.

Full documentation: [s3.dimah.dev/docs/core](https://s3.dimah.dev/docs/core) ·
[llms.txt](https://s3.dimah.dev/llms.txt)

## Install

```bash
pnpm add @dimah-s3/core@beta
```

## Minimal setup

```ts
import { createS3Client, isAPIError } from "@dimah-s3/core";

export const api = createS3Client({
  // Must match the server basePath.
  basePath: "/api/s3",
  credentials: "include",
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
});

try {
  const { url } = await api.download({ route: "uploads", key });
} catch (error) {
  if (isAPIError(error)) {
    console.error(error.statusCode, error.code, error.message);
  }
}
```

Every method takes a payload, then optional `{ signal, headers }`. Uploads
return an upload `ticket`; confirm and the later multipart calls send only
that ticket.

For React apps, use `createS3Client` from `@dimah-s3/react`. It takes the same
options and adds a bound `Provider` and `useApi`.

## Errors

Every failure is an `APIError` with a stable `code` from `S3_ERROR_CODES`.
Narrow it with `isS3ErrorCode(error, "OBJECT_NOT_FOUND")`. See
[Errors](https://s3.dimah.dev/docs/server/errors).

## Upgrading from 1.7

See [Upgrade to 2.0 beta](https://s3.dimah.dev/docs/migration-2-0).

## License

MIT
