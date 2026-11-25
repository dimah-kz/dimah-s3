---
packages:
  "@dimah-s3/db": minor
---

### onFolderDeleted runs once

Of two `DELETE /db/folder` calls at once for the same folder, only the one that removed it runs `onFolderDeleted`. Before, both could run it.

- **`s3.db.folders.delete`.** Resolves `true` when the call removed the folder, and `false` when it was already gone, also when a concurrent delete removed it first. It resolved `undefined` before.
