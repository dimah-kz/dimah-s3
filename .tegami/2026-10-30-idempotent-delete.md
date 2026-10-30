---
packages:
  group:dimah-s3: minor
---

### Delete is idempotent

`api.delete` and `deleteMany` no longer fail with `OBJECT_NOT_FOUND` when the object is not in the bucket, such as an upload that was presigned but never sent, an aborted multipart upload, or an object a lifecycle rule removed. The guards still run, `DeleteObject` is skipped, and `delete.onDeleted` runs with `existed: false`. The response is `{ success: true, existed: false }`, and each `deleteMany` result reports `existed`.

With `db()`, deleting such a key soft- or hard-deletes its `pending` row, so it stops counting toward quota before `purgeStalePendingObjects` runs. A pending multipart upload is aborted by its `uploadId`.
