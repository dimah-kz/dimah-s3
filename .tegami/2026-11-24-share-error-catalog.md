---
packages:
  "@dimah-s3/core": minor
  "@dimah-s3/react": minor
  "@dimah-s3/share": minor
---

### useFormatError words the share codes

The `SHARE_*` codes are in the core catalog, so `useFormatError` turns them into messages your `translations` can localize, like every other code. [Errors](https://s3.dimah.dev/docs/share/api#errors).

- **`S3_ERROR_CODES`.** Adds `SHARE_LINK_NOT_FOUND`, `SHARE_LINK_EXPIRED`, `SHARE_LINK_REVOKED`, `SHARE_LINK_EXHAUSTED`, `SHARE_TARGET_UNAVAILABLE`, `SHARE_PASSWORD_REQUIRED`, `SHARE_PASSWORD_INVALID`, `SHARE_FOLDER_LINKS_DISABLED`, and `SHARE_DOWNLOAD_URL_INVALID`, with the statuses and messages they had.
- **`useFormatError`.** A message for each, and a translation key for each, such as `"This link has expired(API error)"`.
- **`SHARE_ERROR_CODES`.** Names the same core entries. `share()` and `shareClient()` no longer add their own `$ERROR_CODES`; the codes stay on `s3.$ERROR_CODES` and the client's through the core catalog. Keep every `@dimah-s3/*` package on the same version: an older `share()` next to this core fails at `dimahS3()` with a code the core catalog already defines.
