# @dimah-s3/example-with-nextjs

Monorepo twin of [`templates/nextjs`](../../templates/nextjs): same files and wiring, but `@dimah-s3/*` comes from `workspace:*` so you can exercise local packages without publishing.

For an app outside this repo, use `npx @dimah-s3/cli@beta create my-app`.

For DB persistence see [`examples/with-db`](../with-db).

## Setup

From the monorepo root:

```bash
pnpm install
cp examples/with-nextjs/.env.example examples/with-nextjs/.env
# fill in S3 credentials
pnpm --filter @dimah-s3/example-with-nextjs dev
```

Open `/` — upload a file with `UploadTrigger`. `next dev` uses a random development secret when `DIMAH_S3_SECRET` is empty; set it for `next start`.

`next build` loads `src/lib/s3.ts`, and `dimahS3()` needs a bucket, so `S3_BUCKET` must be set (any non-empty value) when you build.

## License

MIT
