# dimah-s3 — Next.js template

Minimal [Next.js](https://nextjs.org) App Router starter with [dimah-s3](https://s3.dimah.dev): presign API route, `S3Provider`, and an upload trigger with toasts.

## Create

```bash
npx @dimah-s3/cli@beta create my-app
```

`cd my-app`, fill `S3_*` in `.env`. `create` writes a generated `DIMAH_S3_SECRET` there too (otherwise use `openssl rand -base64 32`). For browser uploads, configure bucket CORS — see [Providers](https://s3.dimah.dev/docs/providers).

`next build` loads `src/lib/s3.ts`, and `dimahS3()` needs a bucket, so set `S3_BUCKET` (any non-empty value) wherever you build, even if the real values are only injected at runtime.

## What’s included

| Path                              | Role                                                  |
| --------------------------------- | ----------------------------------------------------- |
| `src/lib/s3.ts`                   | `awsS3` + `dimahS3({ secret, routes })`               |
| `src/lib/s3-client.ts`            | `createS3Client()` + `S3Provider`                     |
| `src/app/api/s3/[...s3]/route.ts` | Next.js adapter (`GET`/`POST`/`PUT`/`PATCH`/`DELETE`) |
| `src/app/layout.tsx`              | `S3Provider` + `Toaster`                              |
| `src/app/page.tsx`                | Sample `Upload` + `UploadTrigger` + `UploadToasts`    |

Same layout as [Quickstart](https://s3.dimah.dev/docs/quickstart), [Server Setup](https://s3.dimah.dev/docs/server/setup), [React Setup](https://s3.dimah.dev/docs/react/setup), and [UI Setup](https://s3.dimah.dev/docs/react/ui). Flatten `src/` with `create --no-src`.

## License

MIT
