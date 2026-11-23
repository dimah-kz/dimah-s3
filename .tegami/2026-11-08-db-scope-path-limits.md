---
packages:
  "@dimah-s3/db":
    replay:
      - exit-prerelease(npm:@dimah-s3/db)
---

### Scopes and folder paths fit the database

`db()` checks the scope and the folder path against the limits of the columns and indexes that hold them, so a value the database would reject fails with a clear error first, the same way on SQLite, PostgreSQL, and MySQL.

- **Scopes.** `resolveScope` returns at most 255 characters, the length of the `scope` columns. A longer scope fails the call as a config error (`500` `INTERNAL_ERROR`, with the length in the server log) before any row is written.
- **Folder paths.** A cached folder path is at most 1024 UTF-8 bytes, like an S3 key, so the `(scope, path)` unique key stays under PostgreSQL's 2704-byte limit for an index entry. A create, rename, or move past it is `FOLDER_INVALID`.
- **Unique conflicts.** Folder and upload conflicts are read from FumaDB's `UniqueConstraintError`, on every adapter.
