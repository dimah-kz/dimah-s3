---
packages:
  "@dimah-s3/server":
    replay:
      - exit-prerelease(npm:@dimah-s3/server)
---

### Next.js route handlers read request bodies

`s3.handler` reads the body of a request wrapped in a `Proxy`, as Next.js App Router route handlers pass it. A presign, confirm, multipart, or `db()` call with a body returns its normal response instead of `500` `INTERNAL_ERROR`.
