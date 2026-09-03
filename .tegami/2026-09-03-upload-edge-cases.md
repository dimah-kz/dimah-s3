---
packages:
  group:dimah-s3: patch
---

### Tighten upload cleanup and client races

Confirm now deletes the object when HeadObject omits `ContentLength`, matching the existing rollback for constraint and `onConfirmed` failures. A failed multipart `onInit` also runs `onAbort`, so plugins like `db()` can drop the pending row.

Resuming a multipart upload only starts a new session when S3 reports the old `uploadId` is gone (`OBJECT_NOT_FOUND`). Transient `listParts` errors no longer discard a valid session, and 4xx API errors are not retried. Overwrite quota checks subtract the replaced object's size. Shared download and delete hooks ignore stale completions after `reset()` or a newer call.
