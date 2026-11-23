---
packages:
  "@dimah-s3/db":
    replay:
      - exit-prerelease(npm:@dimah-s3/db)
---

### Record an object already in the bucket

`s3.db.record` writes an active row for an object the app already put in the bucket: a copy, an import, or a file another system wrote. It does not copy or delete the bytes.

- **Checks.** Every instance guard, then the route guard, runs first, with `operation: "plugin"` and `plugin: { id: "db", action: "record" }`. `resolveScope` and `authorize` then run with `operation: "record"`. The key must sit inside the route namespace (`KEY_INVALID`). The size, type, and eTag come from HeadObject. The route's `fileTypes` and `maxFileSize` apply. An empty object is `FILE_EMPTY`.
- **Quota.** An object that does not fit is refused, and no row is written. The object stays in the bucket.
- **Rows.** A second call for the same bytes returns the row. A different object at the key is `OBJECT_EXISTS`. A row an upload or purge holds is `CONFLICT`. A deleted row is replaced. A `folderId` must exist (`FOLDER_NOT_FOUND`). `null` and `""` are the root. `name` defaults to the last segment of the key.
- **Call.** Pass `{ headers }`, `{ request }`, or `{ locals }` the way you call `s3.api`. `locals` seeds the guards. Every failure is an `APIError`, as from `s3.api`.

#### Breaking changes

- **Handle `operation: "record"` in `resolveScope` and `authorize`.** They receive it from `s3.db.record`. A switch that lists every scope operation needs a `record` case.
