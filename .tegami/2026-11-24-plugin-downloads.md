---
packages:
  "@dimah-s3/server": minor
---

### Plugins send objects they authorized

A plugin that grants access without a session, such as a share link, can send an object the way its route does, and sign the URL that carries the grant. [Plugins](https://s3.dimah.dev/docs/server/plugins#serving-objects-a-plugin-authorized).

- **`env.download.presign(input)`.** A presigned GetObject for a route in presign mode, with the route's `inlineTypes` and `maxExpiresIn`. No guard or download hook runs.
- **`env.download.serve(input, request)`.** The `GET /file` response for a route in proxy mode: Range, conditional headers, and the hardening headers.
- **`env.tokens(purpose)`.** `sign(payload, { expiresIn })` and `verify(token)` with the instance secret, under a key derived for the plugin and the purpose.
- **`env.url(path)`.** The URL of an API path, under `baseURL` when it is set.
- **`PluginRoute.download.disposition`.** The route's default disposition.
