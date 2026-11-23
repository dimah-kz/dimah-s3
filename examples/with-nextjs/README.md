# @dimah-s3/example-with-nextjs

Monorepo twin of [`templates/nextjs`](../../templates/nextjs): same files and wiring, but `@dimah-s3/*` comes from `workspace:*` so you can exercise local packages without publishing.

For an app outside this repo, use `npx @dimah-s3/cli create my-app`.

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

`next build` loads `src/lib/s3.ts`, which reads `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_BUCKET`, so they must be set (any non-empty value) when you build.

The `avatar` route is open: anyone who can reach the app can upload until you add a `guard` (there is a commented stub in `src/lib/s3.ts`). See [Security](https://s3.dimah.dev/docs/server/security).

## License

MIT
