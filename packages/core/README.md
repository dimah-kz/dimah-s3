# @dimah-s3/core

**1.x.** New projects should use the [2.0 beta](https://s3.dimah.dev/docs/core) (`npm i @dimah-s3/core@beta`).

Shared protocol, typed API client, and pure helpers used by `@dimah-s3/server` and `@dimah-s3/react`.

Full documentation: [v1.s3.dimah.dev/docs/core](https://v1.s3.dimah.dev/docs/core) ·
[llms.txt](https://v1.s3.dimah.dev/llms.txt)

## Install

```bash
pnpm add @dimah-s3/core
```

## Minimal setup

```ts
import { createS3Client, APIError } from "@dimah-s3/core";

export const api = createS3Client({
  // optional: auth for core routes + client plugins
  credentials: "include",
  headers: () => ({ Authorization: `Bearer ${token}` }),
});

try {
  await api.download({ route: "uploads", key });
} catch (err) {
  if (err instanceof APIError)
    console.error(err.statusCode, err.code, err.message);
}
```

For React apps, prefer `createS3Client` from `@dimah-s3/react` (returns the API
object plus a bound `Provider` / `useApi`).

## License

MIT
