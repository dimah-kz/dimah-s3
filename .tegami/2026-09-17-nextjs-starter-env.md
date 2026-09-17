---
packages:
  group:dimah-s3: patch
---

### Fail fast when Next.js starter env is missing

The Next.js CLI starter now throws if `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, or `S3_BUCKET` is unset, matching the workspace demo.
