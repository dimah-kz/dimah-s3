---
packages:
  group:dimah-s3: minor
---

### Object list: sources, selection, and composable UI

The file list is rebuilt around three layers you can use apart.

**`useObjectList` (`@dimah-s3/react`)** takes a source: `query` plus `getKey` (required) and `getFile` (name, `objectKey`, `size`, `contentType`, `updatedAt`, `previewUrl`). New on the return: `entries` (folders then files, each with a unique `key`), `sort` / `setSort`, `search` / `setSearch` (sent to the query as `sort` and `search`), `status`, `retry`, `goUp`, `setItems` / `setFolders` / `removeItems` for local edits, and the source's `uploadOptions` and `createFolder`. `refresh()` reloads every page on screen instead of only the first. A new sort or search keeps the rows on screen while it loads; opening a folder clears the search. `sort`, `search`, and `parent` can each be controlled.

**`useObjectListSelection`** is new and headless: `toggle` with Shift ranges, `select`, `selectAll`, `clear`, `single` / `multiple` modes, `isSelectable`, and `persist` to keep files from other folders.

**`memoryObjectSource`** from `@dimah-s3/react/engine` serves records you hold, with folders from a path, search, sort, pages, usage, and `limits`. **`useFormatDate`** formats dates for the `S3Provider` locale.

**`dbObjectSource(api.db, { route, folders })`** from `@dimah-s3/db/client` lists one `db()` folder at a time, forwards the list's search and sort, and gives the list `uploadOptions` and `createFolder`.

**`ObjectList` (`@dimah-s3/ui`)** takes the hook returns — `list`, `selection`, `upload`, `download`, `share`, `delete` — and gains a grid view, search, sort, keyboard navigation (arrows, Space, Backspace), paste-to-upload, a Load more mode, and default file menus. Pass `children` to compose the parts: `ObjectListHeader`, `ObjectListBreadcrumb`, `ObjectListSearch`, `ObjectListSortMenu`, `ObjectListViewToggle`, `ObjectListSelectionBar`, `ObjectListBulkDelete`, `ObjectListUsage`, `ObjectListUploadStatus`, `ObjectListContent`, `ObjectListRow`, `ObjectListTile`, `ObjectListEmpty`, and `useObjectListContext`. Deleting a file drops it from the rows at once, then reloads.

#### Breaking changes

- `useObjectList` requires `getKey`. The query input adds `sort` and `search`.
- `ObjectList` no longer takes `getKey`, `getLabel`, `getDescription`, `getFileName`, `getFileType`, `getPreviewUrl`, or `getObjectKey` — return those from `getFile` on the source. `selectable` and `onSelectionChange` are replaced by `selection={useObjectListSelection(list)}`. `header` is now `toolbar`. `renderItem` / `renderFolder` become `renderEntry`; `renderActions`, `renderMeta`, and `renderFolderActions` become entry-based `renderActions`, `renderMeta`, and `renderDescription`. `emptyTitle` / `emptyDescription` become `empty={<ObjectListEmpty title=… />}`. `list` must be a `useObjectList` return.
- `ObjectListMenu` is renamed `ObjectListItemMenu`. Inside a list every prop is optional: the list is the `Delete` root, so it owns the confirm dialog.
- `@dimah-s3/db/client`: `dbObjectQuery` and `dbObjectListAccessors` are replaced by `dbObjectSource(api.db, { route, folders })`. Read a row's file fields with `source.getFile(row)`.
- `ObjectListView` (the old list-state type) is removed; the name now means the `"list" | "grid"` view.
