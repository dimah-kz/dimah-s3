---
packages:
  "@dimah-s3/react": minor
---

### Rename a listed file or folder

`useObjectList` renames through the source. `renameFile({ item, name })` and `renameFolder({ folder, name })` turn on `list.renameFile(item, name)` and `list.renameFolder(folder, name)`. Return the updated row and the list shows it. Leave the return out and the list reloads. A sort on `name`, or a search, reloads either way. An unchanged name does not call the source.
