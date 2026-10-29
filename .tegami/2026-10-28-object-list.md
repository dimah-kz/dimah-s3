---
packages:
  group:dimah-s3: minor
---

### Page a file catalog from your own query

`useObjectList` loads folders and files from a query you pass in. `ObjectList` renders that state. File checkboxes sit in each row; a folder gets one only when you pass its object keys. After a selection, the header becomes a bar that deletes the loaded page. When another page exists, that checkbox is "Select this page" and the bar says the selection is on this page. `onSelectionChange` reports the checked rows, and `selectionActions` adds your own controls beside Delete. `renderMeta` places your own status beside the file name. `onOpenItem` runs when a file row is clicked. A long name truncates inside the row and keeps a short file extension, the same way attachments do. Hover the name to read it in full. `ObjectListMenu` adds download, delete, and copy link on each row. Pass `onDeleted` to reload after that row is deleted. Copy link signs a URL, copies it, and shows the TTL the server returned. Pass `expiresIn` to ask for a shorter link, and a second `useDownload` with `disposition: "inline"` when that link should open in a browser. A path longer than the root plus two folders collapses the earlier folders into a menu. `dbObjectQuery` adapts `api.db.listObjects` when you use the database plugin, and `dbObjectListAccessors` maps those rows onto the list. A key `prefix` filter now applies inside the list query so pages stay full.
