---
packages:
  "@dimah-s3/core":
    replay:
      - exit-prerelease(npm:@dimah-s3/core)
---

### Fix base64url on large inputs

Encoding and decoding a large base64url value no longer stalls.
