---
packages:
  "@dimah-s3/ui":
    replay:
      - exit-prerelease(npm:@dimah-s3/ui)
---

### Move, folder delete, thumbnails, and folder drops in ObjectList

`ObjectList` moves entries, deletes folders with what they hold, shows image thumbnails, and keeps the folders of a dropped folder. Each turns on from the source or a prop.

- **Move.** When the source has `moveFile` or `moveFolder`, entries have **Move to…** in their menu and the selection bar has **Move**. The Move dialog opens in the open folder; browse to a folder and choose **Move here**. A folder cannot be opened in the dialog while it moves. A row dragged onto a folder row, or onto the root or the parent in the path, moves there, and a selected row takes the selection with it. `ObjectListBulkMove` is the Move button for a selection bar of your own, and `startMove(entries, { trigger })` on `useObjectListContext()` opens the dialog.
- **Folder delete.** With `delete` and a source that has `deleteFolder`, folders have Delete in their menu and join a bulk delete. After the one confirmation, `listFolderKeys` names each folder's files, `delete` removes them with the selected files in one request, and `deleteFolder` removes each folder whose files all went. A folder with a file that failed stays.
- **The Delete key.** Delete, or Cmd+Backspace on a Mac, asks to delete the selection, else the focused entry.
- **`thumbnails`.** `thumbnails={{ route }}` signs a picture for each PNG, JPEG, GIF, WebP, AVIF, SVG, BMP, or ICO file without a `previewUrl`, once its row or tile comes into view, and signs it again before it expires. Pass `api` without an `S3Provider`. `ObjectListThumbnails` is its type.
- **Dropped folders keep their folders.** With `uploadOptions` and `createFolder` on the source, the folders inside a dropped folder are found by name below the folder it lands in, or created as their first file starts, and their files upload there. An `UploadDropzone` inside the list does the same.
- **Delete requests carry their own copy and work.** `request(targets, options)` from `useDeleteContext()` takes `title` and `description` for the dialog, and `run(remove)` to delete in place of the targets, such as a folder and its files; `targets` may then be empty. The dialog stays busy until `run` settles. `DeleteTargetsFn` is the type of `remove`.

#### Breaking changes

- **Move `resolveFolderKeys` to the source as `listFolderKeys`, and add `deleteFolder`.** `ObjectList` no longer takes `resolveFolderKeys`. `dbObjectSource` sets both, and `memoryObjectSource` sets `listFolderKeys`. Without `deleteFolder`, folders have no Delete and stay out of a bulk delete.
