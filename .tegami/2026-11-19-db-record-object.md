---
packages:
  "@dimah-s3/db": minor
---

### Record an object the app copied

`s3.db.record` writes an active row for an object the app already put in the bucket, such as a copy made with its own S3 client. It does not copy the bytes.

- **Checks.** The key must sit inside the route namespace (`KEY_INVALID`). `resolveScope` and `authorize` run with `operation: "record"`. The size, type, and eTag come from HeadObject. An empty object is `FILE_EMPTY`.
- **Quota.** An object that does not fit is deleted, and no row is written, the same as a confirm that no longer fits.
- **Rows.** An active row at the key is `OBJECT_EXISTS`. A row an upload or purge holds is `CONFLICT`. A deleted row is replaced. A `folderId` must exist (`FOLDER_NOT_FOUND`). `null` and `""` are the root.
- **Call.** Pass `{ headers }`, `{ request }`, or `{ locals }` the way `resolveScope` reads the caller. `record` does not run the route guard.

#### Breaking changes

- **Handle `operation: "record"`.** `resolveScope` and `authorize` receive it from `s3.db.record`. A switch that lists every `ScopeOperation` needs a `record` case.
