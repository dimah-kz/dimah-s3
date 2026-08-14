# dimah-s3 — Vite template

Minimal [Vite](https://vitejs.dev) + React starter with [dimah-s3](https://dimah-s3.vercel.app): Hono presign API, `S3Provider`, and an upload button.

## Create

```bash
npx @dimah-s3/cli@latest create my-app --template vite
```

`cd my-app`, fill `S3_*` in `.env`. For browser uploads, configure bucket CORS — see [Providers](https://dimah-s3.vercel.app/docs/providers).

`npm run dev` starts the Hono API (`:8787`) and Vite (`:5173`). Open the Vite URL; `/api` is proxied to the API.

## What’s included

| Path                             | Role                                |
| -------------------------------- | ----------------------------------- |
| `server/s3-client.ts`            | AWS SDK `S3Client` + default bucket |
| `server/s3.ts`                   | `dimahS3()` server config           |
| `server/index.ts`                | Hono API (`toHonoHandler`)          |
| `src/components/s3-provider.tsx` | Client `createS3Client` + provider  |
| `src/App.tsx`                    | Sample `UploadButton`               |

## Docs

- [Quickstart](https://dimah-s3.vercel.app/docs/quickstart)
- [Server setup](https://dimah-s3.vercel.app/docs/server/setup)
- [Client setup](https://dimah-s3.vercel.app/docs/react/setup)
- [UI setup](https://dimah-s3.vercel.app/docs/react/ui)

## License

MIT
