# @dimah-s3/example-with-hono

Monorepo twin of [`templates/hono`](../../templates/hono): same files and wiring, but `@dimah-s3/*` comes from `workspace:*` so you can exercise local packages without publishing.

For an app outside this repo, use `npx @dimah-s3/cli@latest create my-app --template hono`.

For DB persistence see [`examples/with-db`](../with-db).

## Setup

From the monorepo root:

```bash
pnpm install
cp examples/with-hono/.env.example examples/with-hono/.env
# fill in S3 credentials
pnpm --filter @dimah-s3/example-with-hono dev
```

Open the Vite URL — upload a file with `UploadButton`. `/api` is proxied to Hono.

## License

MIT
