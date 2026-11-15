---
packages:
  "@dimah-s3/db": minor
---

### Track an object you copied: `s3.db.objects.create`

dimah-s3 leaves S3 `CopyObject` to your own `S3Client`. Until now the copy then had no row: it did not list, could not be downloaded or deleted through a route, and did not count toward quota.

- **`s3.db.objects.create({ bucket, key, scope, route, folderId, filename, size, contentType, eTag, s3Metadata, acl, attributes })`** writes an active row for an object your code put in the bucket. It never calls S3: pass the size and eTag your own copy or `HeadObject` returned.
- Like `update`, it runs no guard and no quota check. A `folderId` must exist in the scope (`FOLDER_NOT_FOUND`). An active row at the key is `OBJECT_EXISTS`, and a row an upload or purge holds is `CONFLICT`. A deleted row is replaced by a new one.
- **`CreateObjectInput`** is exported for typing your own helpers.
