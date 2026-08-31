# dimah-s3 — Next.js template

Minimal [Next.js](https://nextjs.org) App Router starter with [dimah-s3](https://dimah-s3.vercel.app): presign API route, `S3Provider`, and an upload button.

## Create

```bash
npx @dimah-s3/cli@latest create my-app
```

`cd my-app`, fill `S3_*` in `.env`. For browser uploads, configure bucket CORS — see [Providers](https://dimah-s3.vercel.app/docs/providers).

## What’s included

| Path                              | Role                                                  |
| --------------------------------- | ----------------------------------------------------- |
| `src/lib/s3.ts`                   | `awsS3` + `dimahS3({ routes })`                       |
| `src/lib/s3-client.ts`            | `createS3Client()` + `S3Provider`                     |
| `src/app/api/s3/[...s3]/route.ts` | Next.js adapter (`GET`/`POST`/`PUT`/`PATCH`/`DELETE`) |
| `src/app/layout.tsx`              | `S3Provider` + `Toaster`                              |
| `src/app/page.tsx`                | Sample `UploadButton`                                 |

Same layout as [Quickstart](https://dimah-s3.vercel.app/docs/quickstart), [Server setup](https://dimah-s3.vercel.app/docs/server/setup), [Client setup](https://dimah-s3.vercel.app/docs/react/setup), and [UI setup](https://dimah-s3.vercel.app/docs/react/ui). Flatten `src/` with `create --no-src`.

## License

MIT
