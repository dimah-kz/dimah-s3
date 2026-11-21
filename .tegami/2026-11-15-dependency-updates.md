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

`@dimah-s3/server` and `@dimah-s3/cli` use the current patch and minor releases of their dependencies.

- **`@dimah-s3/server`** depends on `@aws-sdk/s3-presigned-post` and `@aws-sdk/s3-request-presigner` `^3.1174.0`.
- **`@dimah-s3/cli`** uses `@clack/prompts` `^1.9.0`.
