# dimah-s3

**Full-stack S3 toolkit for the React ecosystem.**

dimah-s3 ships server handlers, headless React hooks, optional UI, and an
optional database plugin for object tracking. You pass in your own AWS SDK
`S3Client`.

It is presign-first: the server signs, the browser talks to the bucket, and
credentials never leave the backend.

```
Browser  →  Server  →  Bucket
asks for a URL · signs and runs hooks · receives the bytes
```

Upload and download are presigned — the browser talks to the bucket.
Multipart is part of upload. Delete is not: it goes to your API. After
`guard`, the server calls `DeleteObject`. The browser never talks to the
bucket for this step.

It is not an S3 SDK wrapper. List, copy, tagging, and other operations stay
in your own code with the
[AWS SDK](https://www.npmjs.com/package/@aws-sdk/client-s3).

Amazon S3, Cloudflare R2, MinIO, and other S3-compatible stores work — see
[Providers](https://dimah-s3.vercel.app/docs/providers).

## What you get

- Fast setup — a working upload in minutes, not a week of wiring
- Full stack — server, client, and UI; not a client uploader you have to back
  yourself
- Full lifecycle — upload, download, and delete, including multipart
- Server hooks — auth, quotas, confirm, and cleanup where they belong
- Optional database — ownership, listings, and resumable uploads when you
  need them

## Why I built this

Every new app needed the same S3 stack: a presign-only backend, a client that
talks to the bucket, some UI, and often a table of who owns which file. That
is not hard once. It is expensive every time.

Most people start with a client uploader like
[Uppy](https://uppy.io/docs/aws-s3/) and write the presign API themselves.
The uploader is the easy part. A correct, secure presign-only backend is
not. The flow is small, easy to get wrong, and it holds the keys. Then you
still need UI, object tracking, and the rest of the file flows.

dimah-s3 is that backend, written once. The standard pieces are there. You
extend it with hooks and plugins.

## Create an app

```bash
npx @dimah-s3/cli@latest create my-app
```

Already have a project? Follow
[Quickstart](https://dimah-s3.vercel.app/docs/quickstart).

## Packages

| Package                               | Role                                                                |
| ------------------------------------- | ------------------------------------------------------------------- |
| [`@dimah-s3/server`](packages/server) | Backend — signs URLs, runs hooks, keeps credentials on the server   |
| [`@dimah-s3/react`](packages/react)   | Headless React client — intake, progress, retry, cancel, multipart  |
| [`@dimah-s3/ui`](packages/ui)         | Optional shadcn controls for upload, download, and delete           |
| [`@dimah-s3/core`](packages/core)     | Shared protocol, typed HTTP client, and helpers                     |
| [`@dimah-s3/db`](packages/db)         | Optional plugin to track ownership, listings, and resumable uploads |
| [`@dimah-s3/cli`](packages/cli)       | Scaffold official starters                                          |

## Examples

Runnable apps in this repo (`workspace:*` packages). For a new app outside
the monorepo, use the CLI above.

| Example                               | What it shows             |
| ------------------------------------- | ------------------------- |
| [`with-nextjs`](examples/with-nextjs) | Next.js upload            |
| [`with-vite`](examples/with-vite)     | Vite + Hono API           |
| [`with-hono`](examples/with-hono)     | Hono API + Vite React     |
| [`with-db`](examples/with-db)         | Next.js + object tracking |

## Documentation

[Introduction](https://dimah-s3.vercel.app/docs) ·
[Quickstart](https://dimah-s3.vercel.app/docs/quickstart) ·
[Comparison](https://dimah-s3.vercel.app/docs/comparison) ·
[Server](https://dimah-s3.vercel.app/docs/server) ·
[Client](https://dimah-s3.vercel.app/docs/react) ·
[UI](https://dimah-s3.vercel.app/docs/react/ui) ·
[Providers](https://dimah-s3.vercel.app/docs/providers) ·
[Database](https://dimah-s3.vercel.app/docs/db)

Coding agents: [llms.txt](https://dimah-s3.vercel.app/llms.txt) ·
[llms-full.txt](https://dimah-s3.vercel.app/llms-full.txt)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
