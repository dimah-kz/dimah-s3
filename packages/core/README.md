# @dimah-s3/core

Shared protocol, typed API client, and pure helpers used by `@dimah-s3/server` and `@dimah-s3/react`.

Full documentation: [dimah-s3.vercel.app](https://dimah-s3.vercel.app/docs/quickstart)

## Install

```bash
pnpm add @dimah-s3/core
```

## Minimal setup

```ts
import { createS3Client, DimahS3Error } from "@dimah-s3/core";

export const api = createS3Client({
  // optional: auth for core routes + client plugins
  credentials: "include",
  headers: () => ({ Authorization: `Bearer ${token}` }),
});

try {
  await api.download(key);
} catch (err) {
  if (err instanceof DimahS3Error) console.error(err.status, err.message);
}
```

For React apps, prefer `createS3Client` from `@dimah-s3/react` (returns `api` + bound `S3Provider` / `useApi`).

## License

MIT
