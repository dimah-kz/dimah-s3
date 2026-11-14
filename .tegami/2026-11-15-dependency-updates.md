---
packages:
  "@dimah-s3/server":
    replay:
      - exit-prerelease(npm:@dimah-s3/server)
  "@dimah-s3/cli":
    replay:
      - exit-prerelease(npm:@dimah-s3/cli)
---

### Current dependencies

`@dimah-s3/server` and the starters that `@dimah-s3/cli` scaffolds move to the latest patch and minor releases of their dependencies.

- **`@dimah-s3/server`** depends on `@aws-sdk/s3-presigned-post` and `@aws-sdk/s3-request-presigner` `^3.1169.0`.
- **`@dimah-s3/cli`** uses `@clack/prompts` `^1.9.0`. The Next.js, Vite, and Hono starters scaffold with `next` `^16.4.6`, `vite` `^8.3.8`, `hono` `^4.13.18`, and `@aws-sdk/client-s3` `^3.1169.0`.
