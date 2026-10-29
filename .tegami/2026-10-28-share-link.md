---
packages:
  group:dimah-s3: minor
---

### Choose a shorter share link

Download presign accepts an optional `expiresIn`. The signed TTL is the shorter of that request and the route's `download.expiresIn` (default 10 minutes). `download.resolve` can still choose another TTL, up to `maxExpiresIn`. `GET /routes` reports the cap. `ObjectListMenu` can send that shorter TTL when it copies a link, then shows the TTL the server signed.
