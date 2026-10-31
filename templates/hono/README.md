# dimah-s3 — Hono template

Minimal [Hono](https://hono.dev) starter with a Vite + React UI and [dimah-s3](https://s3.dimah.dev): `toHonoHandler` presign routes, `s3Client.Provider`, and an upload trigger with toasts.

## Create

```bash
npx @dimah-s3/cli@latest create my-app --template hono
```

`cd my-app`, fill `S3_*` in `.env`. `create` writes a generated `DIMAH_S3_SECRET` there too (otherwise use `openssl rand -base64 32`). For browser uploads, configure bucket CORS — see [Providers](https://s3.dimah.dev/docs/providers).

`npm run dev` starts Hono (`:3000`) and Vite (`:5173`). Open the Vite URL; `/api` is proxied to Hono. `npm start` after `npm run build` serves the API and static UI from Hono alone.

## What’s included

| Path                   | Role                                                  |
| ---------------------- | ----------------------------------------------------- |
| `src/lib/s3.ts`        | `awsS3` + `dimahS3({ secret, routes })`               |
| `src/lib/s3-client.ts` | `createS3Client()` (same origin via the `/api` proxy) |
| `src/server.ts`        | Hono app (`toHonoHandler` + static after build)       |
| `src/main.tsx`         | `s3Client.Provider` + `Toaster`                       |
| `src/App.tsx`          | Sample `Upload` + `UploadTrigger` + `UploadToasts`    |

Same wiring as [Quickstart](https://s3.dimah.dev/docs/quickstart) (Hono tab), [Server Setup](https://s3.dimah.dev/docs/server/setup), [React Setup](https://s3.dimah.dev/docs/react/setup), and [UI Setup](https://s3.dimah.dev/docs/react/ui).

## License

MIT
