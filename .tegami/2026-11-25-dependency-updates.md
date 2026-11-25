---
packages:
  "@dimah-s3/server": patch
  "@dimah-s3/cli": patch
---

### Current dependencies

`@dimah-s3/server` and the starters that `@dimah-s3/cli` scaffolds move to the latest patch and minor releases of their dependencies.

- **`@dimah-s3/server`** depends on `@aws-sdk/s3-presigned-post` and `@aws-sdk/s3-request-presigner` `^3.1177.0`.
- **`@dimah-s3/cli`** scaffolds the Next.js, Vite, and Hono starters with `@aws-sdk/client-s3` `^3.1176.0` and `lucide-react` `^1.79.0`, and the Vite and Hono starters with `hono` `^4.13.21`.
