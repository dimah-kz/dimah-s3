---
packages:
  "@dimah-s3/core": patch
---

### Fix base64url on large inputs

Encoding and decoding a large base64url value no longer stalls.
