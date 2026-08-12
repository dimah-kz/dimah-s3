# dimah-s3 — Hono template

Minimal [Hono](https://hono.dev) starter with a Vite + React UI and [dimah-s3](https://dimah-s3.vercel.app): `toHonoHandler` presign routes, `S3Provider`, and an upload button.

## Create

```bash
npx @dimah-s3/cli@latest create my-app --template hono
```

`cd my-app`, fill `S3_*` in `.env`. For browser uploads, configure bucket CORS — see [Providers](https://dimah-s3.vercel.app/docs/providers).

`npm run dev` starts Hono (`:3000`) and Vite (`:5173`). Open the Vite URL; `/api` is proxied to Hono. `npm start` after `npm run build` serves the API and static UI from Hono alone.

## What’s included

| Path                             | Role                                |
| -------------------------------- | ----------------------------------- |
| `src/lib/s3-client.ts`           | AWS SDK `S3Client` + default bucket |
| `src/lib/s3.ts`                  | `dimahS3()` server config           |
| `src/server.ts`                  | Hono app (`toHonoHandler` + static) |
| `src/components/s3-provider.tsx` | Client `createS3Client` + provider  |
| `src/App.tsx`                    | Sample `UploadButton`               |

## Docs

- [Quickstart](https://dimah-s3.vercel.app/docs/quickstart)
- [Server adapters](https://dimah-s3.vercel.app/docs/server/adapters)
- [Client setup](https://dimah-s3.vercel.app/docs/react/setup)
- [UI setup](https://dimah-s3.vercel.app/docs/react/ui/setup)

## License

MIT
