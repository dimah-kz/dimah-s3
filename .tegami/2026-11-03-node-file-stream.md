---
packages:
  "@dimah-s3/server":
    replay:
      - exit-prerelease(npm:@dimah-s3/server)
---

### Proxy downloads finish

`GET /file` through the Node adapter writes the object body directly. A download larger than the stream buffer finishes instead of stalling until the client gives up.
