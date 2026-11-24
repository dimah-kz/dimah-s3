---
packages:
  "@dimah-s3/core": minor
  "@dimah-s3/react": minor
  "@dimah-s3/share": minor
---

### useFormatError words the share() rules

A link setting that breaks a `share()` rule still fails with `VALIDATION_ERROR`, and its `params` now name the rule, so `useFormatError` says what to change instead of "Invalid request". `ShareLinkDialog` shows it under the form. [Policy](https://s3.dimah.dev/docs/share/api#policy).

- **`params.rule`.** `passwordRequired`, `passwordTooShort` (with `minLength`), `expiryRequired`, `expiryInPast`, or `expiryTooLong` (with `maxExpiresIn`, in seconds). `params.issue` and the message are unchanged. The `VALIDATION_ERROR` entry of `S3ErrorParamsMap` types them.
- **`useFormatError`.** Words each rule, such as "Use at least 8 characters for the password" and "Choose an expiry of at most 7 days", under keys your `translations` can localize, such as `"Use at least {minLength} characters for the password(API error)"`. A `VALIDATION_ERROR` without a rule still reads "Invalid request".
