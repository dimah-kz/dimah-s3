---
packages:
  group:dimah-s3: minor
---

### Page a file catalog from your own query

`useObjectList` loads folders and files from a query you pass in. `ObjectList` renders that state. Checkboxes sit in each row; after a selection, the header becomes a bar that can download or delete the loaded page. A checked folder is included only when you pass its object keys. `useDownload` can presign that selection without disturbing a single-file download. `ObjectListMenu` adds download, delete, and a temporary link on each row. `dbObjectQuery` adapts `api.db.listObjects` when you use the database plugin, and a key `prefix` filter now applies inside the list query so pages stay full.
