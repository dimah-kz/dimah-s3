---
packages:
  "@dimah-s3/core": patch
---

### Encode large base64url values directly

Base64 encoding writes each group of bytes itself, so a large value finishes instead of stalling.
