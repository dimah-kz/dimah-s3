---
packages:
  "@dimah-s3/db":
    replay:
      - exit-prerelease(npm:@dimah-s3/db)
---

### Move and delete folders from dbObjectSource

`dbObjectSource` moves files and folders and deletes folders with everything in them, through the endpoints `db()` already has.

- **Move.** `moveFile` sends the new `folderId` to `api.db.updateObject`, and `moveFolder` the new `parentId` to `api.db.updateFolder`. The object key stays. Set when `folders` is on.
- **Folder delete.** `listFolderKeys` pages through `GET /db/objects` with `recursive` and the source's filters, so the list can delete those objects with `useDelete`. `deleteFolder` then calls `api.db.deleteFolder({ id, recursive: true })`. Set when `folders` is on, and `deleteFolder` when `api.db` has it.
- **`DELETE /db/folder?recursive=true`.** Removes the folder and the folders below it, deepest first, as long as none of them holds an active or pending object. A folder with one is `FOLDER_NOT_EMPTY`; the empty folders removed before it stay removed. `authorize` sees the folder the call names. `api.db.deleteFolder` takes `recursive`.
- **`s3.db.folders.delete(scope, id, { recursive })`.** The same on the server.
