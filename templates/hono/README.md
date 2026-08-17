# dimah-s3 — Hono template

Minimal [Hono](https://hono.dev) starter with a Vite + React UI and [dimah-s3](https://dimah-s3.vercel.app): `toHonoHandler` presign routes, `s3Client.Provider`, and an upload button.

## Create

```bash
npx @dimah-s3/cli@latest create my-app --template hono
```

`cd my-app`, fill `S3_*` in `.env`. For browser uploads, configure bucket CORS — see [Providers](https://dimah-s3.vercel.app/docs/providers).

`npm run dev` starts Hono (`:3000`) and Vite (`:5173`). Open the Vite URL; `/api` is proxied to Hono. `npm start` after `npm run build` serves the API and static UI from Hono alone.

## What’s included

| Path                   | Role                                                  |
| ---------------------- | ----------------------------------------------------- |
| `src/lib/s3.ts`        | `awsS3` + `dimahS3()` (`upload.prefix`)               |
| `src/lib/s3-client.ts` | `createS3Client()` (same origin via the `/api` proxy) |
| `src/server.ts`        | Hono app (`toHonoHandler` + static after build)       |
| `src/main.tsx`         | `s3Client.Provider` + `Toaster`                       |
| `src/App.tsx`          | Sample `UploadButton`                                 |

Same wiring as [Quickstart](https://dimah-s3.vercel.app/docs/quickstart) (Hono tab), [Server setup](https://dimah-s3.vercel.app/docs/server/setup), [Client setup](https://dimah-s3.vercel.app/docs/react/setup), and [UI setup](https://dimah-s3.vercel.app/docs/react/ui).

## License

MIT
