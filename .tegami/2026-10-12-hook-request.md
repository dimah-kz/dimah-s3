---
packages:
  group:dimah-s3: patch
---

### Keep the hook request readable

HTTP handlers clone a JSON body before reading it, so `guard` and `resolveScope` can still call `request.clone().json()`. Direct `s3.api` calls copy `query` onto the request URL and replay a JSON `body`, using that endpoint's method and path. A `request` you pass in is left unchanged.
