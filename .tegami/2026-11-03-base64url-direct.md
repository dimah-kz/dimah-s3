---
packages:
  "@dimah-s3/core":
    replay:
      - exit-prerelease(npm:@dimah-s3/core)
---

### Encode large base64url values directly

Base64 encoding writes each group of bytes itself, so a large value finishes instead of stalling.
