# dimah-s3

**Full-stack S3 toolkit for the React ecosystem.**

Server handlers, headless React hooks, optional [shadcn](https://ui.shadcn.com)
UI, and an optional database plugin. You pass in your own AWS SDK `S3Client`.

It is presign-first: the server signs, the browser talks to the bucket, and
credentials never leave the backend. Auth, quotas, and database rules live
in server hooks.

Works with Amazon S3, Cloudflare R2, MinIO, and other S3-compatible stores.
Presign flows only. Anything else stays in your own backend with
[`@aws-sdk/client-s3`](https://www.npmjs.com/package/@aws-sdk/client-s3).

## Packages

| Package            | Role                               |
| ------------------ | ---------------------------------- |
| `@dimah-s3/core`   | Shared client + protocol           |
| `@dimah-s3/server` | Presign handlers + lifecycle hooks |
| `@dimah-s3/react`  | Headless hooks                     |
| `@dimah-s3/ui`     | Optional shadcn UI                 |
| `@dimah-s3/db`     | Optional DB tracking               |
| `@dimah-s3/cli`    | Scaffold official starters         |

## Docs

[dimah-s3.vercel.app](https://dimah-s3.vercel.app/docs) ·
[Comparison](https://dimah-s3.vercel.app/docs/comparison) ·
[llms.txt](https://dimah-s3.vercel.app/llms.txt) (coding agents)

## Create an app

```bash
npx @dimah-s3/cli@latest create my-app
```

## License

MIT
