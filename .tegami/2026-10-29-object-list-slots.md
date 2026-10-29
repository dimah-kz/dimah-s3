---
packages:
  group:dimah-s3: minor
---

### Object list empty state and row actions

`ObjectList` accepts `empty` when the default empty state is not enough. `emptyTitle` and `emptyDescription` still fill that default. `ObjectListMenu` accepts `actions` for extra rows, such as rename, after Copy link and before Delete.

With focus inside the list, Ctrl+A or Cmd+A selects the same rows as the header checkbox. A selected row sets `data-selected`. Files set `data-kind="file"` and folders set `data-kind="folder"`. Opening another folder after an upload no longer reloads the list a second time.
