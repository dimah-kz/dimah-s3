---
packages:
  "@dimah-s3/db": minor
---

### Rename from the database list

`dbObjectSource` renames a file with `api.db.updateObject` (`filename`, same `key` and `bucket`) and a folder with `api.db.updateFolder` (`name`). The stored object key stays. `folders: false` still renames files. A folder name that cannot be one path segment fails with `FOLDER_INVALID` before the request. The methods are set when `api.db` has those actions.
