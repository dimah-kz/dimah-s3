# dimah-s3 — Vite template

Minimal [Vite](https://vitejs.dev) + React starter with [dimah-s3](https://s3.dimah.dev): Hono presign API, `s3Client.Provider`, and an upload trigger with toasts.

## Create

```bash
npx @dimah-s3/cli@latest create my-app --template vite
```

`cd my-app`, fill `S3_*` in `.env`. `create` writes a generated `DIMAH_S3_SECRET` there too (otherwise use `openssl rand -base64 32`). For browser uploads, configure bucket CORS — see [Providers](https://s3.dimah.dev/docs/providers).

`npm run dev` starts the Hono API (`:8787`) and Vite (`:5173`). Open the Vite URL; `/api` is proxied to the API.

## What’s included

| Path                   | Role                                                  |
| ---------------------- | ----------------------------------------------------- |
| `server/s3.ts`         | `awsS3` + `dimahS3({ secret, routes })`               |
| `server/index.ts`      | Hono API (`toHonoHandler` on `/api/s3/*`)             |
| `src/lib/s3-client.ts` | `createS3Client()` (same origin via the `/api` proxy) |
| `src/main.tsx`         | `s3Client.Provider` + `Toaster`                       |
| `src/App.tsx`          | Sample `Upload` + `UploadTrigger` + `UploadToasts`    |

Same wiring as [Quickstart](https://s3.dimah.dev/docs/quickstart) (Vite tab), [Server Setup](https://s3.dimah.dev/docs/server/setup), [React Setup](https://s3.dimah.dev/docs/react/setup), and [UI Setup](https://s3.dimah.dev/docs/react/ui). Cross-origin apps pass `baseURL` instead of relying on the proxy.

## License

MIT
