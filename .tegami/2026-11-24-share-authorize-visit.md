---
packages:
  "@dimah-s3/share": minor
---

### Visitor calls can be refused per link and target

`share({ authorizeVisit })` lets your app refuse a visitor call on a link that still opens, such as one whose file or folder sits in your app's trash. [Authorize and hooks](https://s3.dimah.dev/docs/share/api#authorize-and-hooks).

- **`authorizeVisit(context)`.** Runs on `openLink` once the link is unlocked, and on `listShared`, `downloadShared`, and `sharedFile`, before anything is counted, listed, or sent. `false` fails the call with `SHARE_TARGET_UNAVAILABLE`, the same as a deleted target, and the link opens again once it returns `true`. It checks the call, not each row: a listing or search of a shared folder still names a hidden file or subfolder inside it, and opening or downloading that one is refused. A presigned URL handed out before it turned `false` works until it expires; a proxy URL stops at once.
- **`ShareVisitContext`.** `action`, `link`, `target`, `request`, `locals`, the `folder` the call lists or that holds the file, and the `object` it reaches: the file it sends, or the file of an object link on `openLink` and `listShared`.
- **`ShareVisitAction`.** The public actions that reach a target: every one but `unlockLink`.
