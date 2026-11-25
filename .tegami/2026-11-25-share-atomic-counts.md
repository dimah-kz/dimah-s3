---
packages:
  "@dimah-s3/share": minor
---

### Share counts that hold under load

A download, a view, and a revoke each change a link in one statement, so concurrent visitors and owners no longer race.

- **Downloads.** `downloadShared` counts a download only while the link is not revoked, has not expired, and is under `maxDownloads`, in the same statement that adds it. Concurrent downloads each count and never pass the limit. Before, a burst of downloads on one link could fail with `CONFLICT` although the limit was far away.
- **Views.** Every view of `openLink` is counted. Before, of two views at once, one could be lost.
- **Counts.** `s3.share.links.revokeTarget` and `s3.share.pruneLinks` return what they changed, from the same statement that changes it.
- **`share_link.write_token`.** No longer written. The column stays until a major release changes the share schema, so your tables do not change.
