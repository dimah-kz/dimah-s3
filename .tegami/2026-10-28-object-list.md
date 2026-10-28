---
packages:
  group:dimah-s3: minor
---

### Page a file catalog from your own query

`useObjectList` loads folders and files from a query you pass in. `ObjectList` renders that state. `dbObjectQuery` adapts `api.db.listObjects` when you use the database plugin, and a key `prefix` filter now applies inside the list query so pages stay full.
