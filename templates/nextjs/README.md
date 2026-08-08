# dimah-s3 — Next.js template

Minimal [Next.js](https://nextjs.org) App Router starter with [dimah-s3](https://dimah-s3.vercel.app): presign API route, `S3Provider`, and an upload button.

## Create

```bash
npx degit dimah-kz/dimah-s3/templates/nextjs my-app
cd my-app
cp .env.example .env
npm install
npm run dev
```

Fill `S3_*` in `.env`. For browser uploads, configure bucket CORS — see [Providers](https://dimah-s3.vercel.app/docs/providers).

## What’s included

| Path                          | Role                                |
| ----------------------------- | ----------------------------------- |
| `lib/s3-client.ts`            | AWS SDK `S3Client` + default bucket |
| `lib/s3.ts`                   | `dimahS3()` server config           |
| `app/api/s3/[...s3]/route.ts` | Next.js route adapter               |
| `components/s3-provider.tsx`  | Client `createS3Client` + provider  |
| `app/page.tsx`                | Sample `UploadButton`               |

## Docs

- [Quickstart](https://dimah-s3.vercel.app/docs/quickstart) — wire into an existing app
- [Server setup](https://dimah-s3.vercel.app/docs/server/setup)
- [Client setup](https://dimah-s3.vercel.app/docs/react/setup)

## License

MIT
