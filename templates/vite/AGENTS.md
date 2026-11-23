# dimah-s3

Vite + React starter with [dimah-s3](https://s3.dimah.dev): Hono API via `@dimah-s3/server/hono`, `@dimah-s3/react` for the client, and `@dimah-s3/ui` for upload UI.

Uploads need `DIMAH_S3_SECRET` (at least 32 characters, the same on every instance) in `.env`. `create` generates one. Keep it and the `S3_*` credentials on the server only.

Docs: [Quickstart](https://s3.dimah.dev/docs/quickstart) · [Providers](https://s3.dimah.dev/docs/providers)
