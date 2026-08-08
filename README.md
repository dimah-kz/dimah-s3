# dimah-s3

**dimah-s3** gives you the standard S3 lifecycle with a small surface: upload, download, and delete — built on [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/).

It stays presign-first. The server signs short-lived URLs with your `S3Client`; the client talks to S3 directly. Credentials never leave the backend. Auth, quotas, and database rules live in server hooks — not inside the transfer path.

On the client you get headless hooks to compose your own UI, plus an optional component layer when you want something ready-made.

Presign flows only. Anything else stays in your own backend with [`@aws-sdk/client-s3`](https://www.npmjs.com/package/@aws-sdk/client-s3).

## Packages

| Package            | Role                               |
| ------------------ | ---------------------------------- |
| `@dimah-s3/core`   | Shared client + protocol           |
| `@dimah-s3/server` | Presign handlers + lifecycle hooks |
| `@dimah-s3/react`  | Headless hooks + i18n types        |
| `@dimah-s3/ui`     | Optional UI components             |
| `@dimah-s3/db`     | Optional DB tracking               |

## Docs

[dimah-s3.vercel.app](https://dimah-s3.vercel.app)

## Starter (Next.js)

```bash
npx degit dimah-kz/dimah-s3/templates/nextjs my-app
cd my-app && cp .env.example .env && npm i && npm run dev
```

More templates: [`templates/`](./templates).

## License

MIT
