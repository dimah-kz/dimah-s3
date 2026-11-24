---
packages:
  "@dimah-s3/core": minor
  "@dimah-s3/react": minor
---

### A code for rate limits

`TOO_MANY_REQUESTS` (`429`) is in the core catalog, for a guard that limits calls, such as `unlockLink` per IP: `throw s3Error("TOO_MANY_REQUESTS")`. The library never sends it itself.

- **`useFormatError`.** Words it as "Too many requests. Try again later.", under the key `"Too many requests. Try again later.(API error)"`.
- **Retries.** The React hooks that retry already treat any `429` as transient, whatever its code.
- **Plugin codes.** A plugin that defines its own `TOO_MANY_REQUESTS` with `defineErrorCodes` now fails at `dimahS3()`, since the core catalog defines it. Throw the core entry instead.
