---
packages:
  "@dimah-s3/core":
    replay:
      - exit-prerelease(npm:@dimah-s3/core)
---

### Large base64url values finish

Encoding and decoding a large base64url value finishes instead of stalling.
