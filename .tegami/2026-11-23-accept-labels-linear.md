---
packages:
  "@dimah-s3/react": patch
---

### Accept labels in linear time

`formatAcceptLabels` from `@dimah-s3/react/engine`, and `useFormatAcceptLabels`, cut a MIME type's `+suffix` without a regular expression, so an `accept` token with a long run of `+` no longer takes quadratic time. The labels do not change.
