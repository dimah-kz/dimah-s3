---
packages:
  "@dimah-s3/server":
    replay:
      - exit-prerelease(npm:@dimah-s3/server)
---

### Fix proxy downloads that never finish

`GET /file` through the Node adapter now writes the object body directly. A download larger than the stream buffer no longer stalls until the client gives up.
