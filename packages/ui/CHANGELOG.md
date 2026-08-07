## @dimah-s3/ui@0.4.0

### Add framework adapters for popular servers

Mount `dimahS3().handler` with first-class adapters for Express, Hono, Fastify, Elysia, and SvelteKit (alongside Next.js and Node). Each ships as a subpath export such as `@dimah-s3/server/hono` with no framework peer dependency.

## @dimah-s3/ui@0.3.2

### update domain to https://dimah-s3.vercel.app

## @dimah-s3/ui@0.3.1

### update deps

## @dimah-s3/ui@0.3.0

### Drizzle ORM 1.x peer support

`@dimah-s3/db` now accepts `drizzle-orm` `>=1.0.0-rc.1` alongside `0.44` / `0.45`. Requires FumaDB 0.5+ for the Drizzle adapter.

## @dimah-s3/ui@0.2.0

### Use shadcn Base UI toast instead of Sonner

Upload, download, and delete feedback now uses the shadcn Base UI toast.

- **npm:** mount `<Toaster />` from `@dimah-s3/ui` in your root layout.
- **Registry:** install shadcn `toast` and mount `<Toaster />` from `@/components/ui/toast`.

## @dimah-s3/ui@0.1.3

### docs update

## @dimah-s3/ui@0.1.2

### Verify OIDC publish for all packages

Confirm GitHub Actions trusted publishing works for the full `@dimah-s3/*` line, including `@dimah-s3/db`.

## @dimah-s3/ui@0.1.1

### Verify npm trusted publishing (OIDC)

Test patch to confirm GitHub Actions can publish via trusted publishers without `NPM_TOKEN`.

## @dimah-s3/ui@0.1.0

### Initial release

First public release of the Dimah S3 presigned upload, download, and delete toolkit (`@dimah-s3/core`, `server`, `react`, `ui`, `db`).
