---
packages:
  "@dimah-s3/share": minor
  "@dimah-s3/ui": minor
---

### Share links take a lifetime

`createLink` and `updateLink` take `expiresIn`, the link's lifetime in whole seconds. The server adds it to its own clock and checks it against `expiration.max`, so a browser clock that runs ahead no longer makes the longest lifetime fail. [createLink input](https://s3.dimah.dev/docs/share/api#createlink-input).

- **`expiresIn`.** An integer of at least 1, on `shareClient()`, `s3.share.api`, and `POST` / `PATCH /share/link`. It is an alternative to `expiresAt`: sending both fails with `VALIDATION_ERROR`. `expiresAt: null` still means the link never expires.
- **`ShareLinkDialog`.** Sends the picked `expiryOptions` lifetime as `expiresIn`, so `expiration.max` can equal the longest option without a margin. Keep `@dimah-s3/share` and `@dimah-s3/ui` on the same version: an older `share()` refuses `expiresIn`.
- **Registry.** `share-link-dialog` and `shared-view` install `@dimah-s3/share@^2.3.0`.
