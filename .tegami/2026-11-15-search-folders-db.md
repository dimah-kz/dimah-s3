---
packages:
  "@dimah-s3/db": major
---

### Search across folders in db()

`GET /db/objects` searches a folder and every folder below it, and search ignores case, accents, and look-alike letters the same way on SQLite, PostgreSQL, and MySQL.

- **`recursive`.** With `folderId`, `api.db.listObjects({ folderId, recursive: true })` lists the objects of that folder and every folder below it, up to 10,000 folders. At the root that is the whole scope. `folders` then holds every folder below that matches `search`, by name. `s3.db.objects.list` and `count` take `recursive` too.
- **`locations`.** Each page of a recursive listing carries the folders on the way to its rows. Walk `parentId` from a row's `folderId` to draw where it lives.
- **`total`.** The first page of a search carries the number of objects that match across every page.
- **Search text.** `search` matches a folded copy of the name, built with `normalizeSearchText` from `@dimah-s3/core`, so `invoice` finds `Invoice.PDF` on PostgreSQL too, and `%`, `_`, and `\` match as themselves. Folder names match the same way.
- **`s3.db.folders.descendants(scope, parentId, { search, limit })`** lists the folders below a folder at any depth, and **`s3.db.folders.ancestors(scope, ids)`** every folder on the way to some folders.
- **`dbObjectSource`** searches below the open folder (`searchScope: "folder"`) or the whole scope (`"all"`), sets `searchScopes`, and gives each result a `location`. Pass `recursiveSearch: false` to search the open folder only, for an `authorize` that refuses `recursive`.
- **Folder names with `_`, `%`, or `\`.** Renaming or moving a folder finds the folders below it through their parent ids, so such a name no longer misses its own subfolders or rewrites another folder's.

#### Breaking changes

- **Create schema `2.2.0` on a new database.** `storage_object` and `storage_folder` gain a required `search_name` column. A database at `2.1.0` is not upgraded: regenerate the Drizzle or Prisma schema with `runCli`, or call `migrate(client)` on an empty database.
- **Search results change.** `search` is no longer a `LIKE` on `filename`: case and accents do not count on any database, and `%` and `_` are no longer wildcards.
- **Check `recursive` in `authorize`.** A `list` call with `recursive: true` returns the objects of every folder below `folder`. An `authorize` that allows a folder and denies a folder inside it must now deny a recursive listing of the outer one, or that listing shows the inner folder's objects. Return `false` for `recursive` to keep listings to one folder, and pass `dbObjectSource(api.db, { recursiveSearch: false })` so the list searches the open folder only.
