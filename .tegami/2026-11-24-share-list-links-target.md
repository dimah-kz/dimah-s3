---
packages:
  "@dimah-s3/share": minor
---

### listLinks shows authorize what it lists

`authorize` can tell a list of one file's or folder's links from a list of the whole scope, so a caller allowed to share in one folder no longer has to see every link of the scope. [Authorize and hooks](https://s3.dimah.dev/docs/share/api#authorize-and-hooks).

- **`target` on `listLinks`.** A list filtered by `key` or `folderId` passes the object or folder to `authorize` as `target`. Without `target`, the call lists every link of the scope.
- **db's `authorize`.** A filtered list runs it with the object or folder, as `createLink` does.
- **A filter that names nothing of the caller's.** No active object at the key, or no folder with the id, in the caller's scope lists nothing, without calling `authorize`.
