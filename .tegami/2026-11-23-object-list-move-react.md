---
packages:
  "@dimah-s3/react":
    replay:
      - exit-prerelease(npm:@dimah-s3/react)
---

### Move entries and delete folders with useObjectList

A source can move files and folders and delete folders, and `useObjectList` runs those actions on the loaded rows. `uploadOptions` can wait for work such as creating a folder.

- **`moveFile` and `moveFolder` on the source.** Each takes the entry and the destination `parent` (`null` is the root). The object key stays as you store it.
- **`list.moveEntries(entries, parent)`.** Moves through the source one entry at a time, drops the moved rows, and reloads once. It never rejects and resolves with `ObjectListMoveResult`: `moved`, and `failed` with each `APIError`. Entries already in `parent` are left alone, and a folder moved into itself fails with `FOLDER_INVALID`. Set when the source has `moveFile` or `moveFolder`.
- **`list.canMove(entry)`.** Whether the source can move that entry. Pass `"file"` or `"folder"` to ask about a kind.
- **`listFolderKeys` and `deleteFolder` on the source.** `listFolderKeys({ folder, signal })` returns the object keys in a folder and every folder below it. `deleteFolder({ folder })` removes the folder and the folders below it once their files are gone. The list returns both: `list.deleteFolder(folder)` drops the folder row, and opens the folder that held it when it was open.
- **`list.listFolders(parent)`.** The folders inside any folder, from the source's first page there, for a folder picker.
- **`list.createFolder(name, { parent })`.** Creates the folder in another folder. Only a folder created in the open one joins the loaded rows.
- **`memoryObjectSource` names folder keys.** With `getFolder`, it returns `listFolderKeys`.
- **Folders join the selection.** `useObjectListSelection` selects files, and folders too when the list can delete or move them. Pass `isSelectable` to choose yourself.
- **`uploadOptions` may return a promise.** A function in `uploadOptions` runs as each file starts. The file stays `preparing` until the promise settles, and cancelling it stops the wait.

#### Breaking changes

- **Match the code of an `APIError` that `uploadOptions` throws.** The file fails with that error. Any other throw or rejection still fails it with `HOOK_FAILED`.
