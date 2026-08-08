# @dimah-s3/example-with-vite

Monorepo twin of [`templates/vite`](../../templates/vite): same files and wiring, but `@dimah-s3/*` comes from `workspace:*` so you can exercise local packages without publishing.

For an app outside this repo, use `npx @dimah-s3/cli@latest create my-app --template vite`.

For DB persistence see [`examples/with-db`](../with-db).

## Setup

From the monorepo root:

```bash
pnpm install
cp examples/with-vite/.env.example examples/with-vite/.env
# fill in S3 credentials
pnpm --filter @dimah-s3/example-with-vite dev
```

Open the Vite URL — upload a file with `UploadButton`. `/api` is proxied to the Hono API.

## License

MIT
