---
packages:
  "@dimah-s3/share": minor
---

### Visitor calls can be refused per link and target

`share({ authorizeVisit })` lets your app refuse a visitor call on a link that still opens, such as one whose file or folder sits in your app's trash. [Authorize and hooks](https://s3.dimah.dev/docs/share/api#authorize-and-hooks).

- **`authorizeVisit(context)`.** Runs on `openLink` once the link is unlocked, and on `listShared`, `downloadShared`, and `sharedFile`, before anything is counted, listed, or sent. `false` fails the call with `SHARE_TARGET_UNAVAILABLE`, the same as a deleted target, and the link opens again once it returns `true`.
- **`ShareVisitContext`.** `action`, `link`, `target`, `request`, `locals`, the `folder` the call lists or that holds the file, and the `object` it sends.
- **`ShareVisitAction`.** The public actions that reach a target: every one but `unlockLink`.
