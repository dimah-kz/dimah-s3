---
packages:
  group:dimah-s3: minor
---

### Open only allowed types in the browser

`download.inlineTypes` lists the MIME types, or `type/*` wildcards, that a route may serve as `inline`. After the guards, presign and `GET /file` read the object's type from HeadObject. A requested `inline` is kept only for a type on the list; anything else is signed as `attachment`. A wildcard never matches HTML, XML (including `image/svg+xml`), or JavaScript, so `image/*` does not open an SVG; list one of those exactly to allow it. An object stored as `application/octet-stream` is typed from its file name, and that type is signed as `ResponseContentType` so it renders.

`GET /routes` returns the list as `download.inlineTypes`. `resolveInlineDisposition` from `@dimah-s3/core` (also re-exported by `@dimah-s3/react`) applies the same rule, so a client can choose Preview or Download from the route instead of keeping a second list. `GET /file` responses now send `X-Content-Type-Options: nosniff`.
