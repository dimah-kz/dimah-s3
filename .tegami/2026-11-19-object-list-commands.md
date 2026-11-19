---
packages:
  "@dimah-s3/ui":
    replay:
      - exit-prerelease(npm:@dimah-s3/ui)
---

### Open New folder and a row menu from outside

`useObjectListCommands()` opens list UI that your own shortcut or menu cannot reach by itself. Pass the object to `ObjectList` as `commands`.

- **`startNewFolder()`.** Opens the New folder name field. It does nothing when the source has no `createFolder`.
- **`openMenu(entryKey)`.** Opens that row's menu. It does nothing when the entry is not on screen.
- **Right-click.** On a row with the default menu, the browser menu stays closed and the row menu opens.
