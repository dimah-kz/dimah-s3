# @dimah-s3/example-with-nextjs

Runnable Next.js demo for [dimah-s3](https://dimah-s3.vercel.app) inside the monorepo (`workspace:*`) — not a production starter.

For a copy-paste / degit app outside this repo, use [`templates/nextjs`](../../templates/nextjs).

For DB persistence see [`examples/with-db`](../with-db).

## Setup

From the monorepo root:

```bash
pnpm install
cp examples/with-nextjs/.env.example examples/with-nextjs/.env
# fill in S3 credentials
pnpm --filter @dimah-s3/example-with-nextjs dev
```

## Routes

- [`/ui`](http://localhost:3000/ui) — `@dimah-s3/ui` npm package demos
- [`/registry`](http://localhost:3000/registry) — placeholder for shadcn registry installs

## License

MIT
