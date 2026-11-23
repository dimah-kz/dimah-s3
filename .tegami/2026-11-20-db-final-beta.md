---
packages:
  "@dimah-s3/db":
    replay:
      - exit-prerelease(npm:@dimah-s3/db)
---

### Schema 2.3.0 and a folder-aware authorize

`db()` reads schema `2.3.0`, `authorize` sees the folder a stored object is in, and the stores take the scope as their first argument.

- **`authorize` sees where the target is.** `folder` and `folderId` are set for download, delete, read, confirm, and the multipart calls too, read from the object's row. A rule on `folder` now covers every way to reach an object. The folder is read only when `authorize` is configured.
- **`destination`.** A move of an object, a rename or move of a folder, and `POST /db/folder` pass `destination: { folder, folderId }`: where the call puts the target.
- **A refused upload leaves no row.** When confirm, multipart complete, or `s3.put` refuses an upload and the server deletes its object, the plugin removes that upload's row through `upload.onRejected`, including an active row the upload was overwriting.
- **Name sort.** `sort: { field: "name" }` orders by the folded name that search matches, so case and accents do not count on SQLite, PostgreSQL, and MySQL alike. `s3.db.folders.children` and `descendants` list folders in that order.
- **`maxFolders`.** A `quota` can cap the folders of a scope. `POST /db/folder` past the cap is `QUOTA_EXCEEDED` with `limit: "folders"`. `s3.db.folders.count(scope)` returns the number.
- **A file-only quota counts rows.** With `maxFiles` and no `maxBytes`, the quota check is one `COUNT`.
- **Folder moves hold under concurrency.** A subfolder created while its parent is renamed gets its new path, a parent deleted during a create or a move is put back, and two moves that would put each folder inside the other end with one undone and `CONFLICT`.
- **The schema check reads the tables.** `checkSchema` and the first query also read one row of each table, so a database the generated schema was never applied to fails there, with what to run.
- **`DB_FOLDER_ID_KEY`.** `@dimah-s3/db` and `@dimah-s3/db/client` export the `clientMetadata` key an upload names its folder with (`"folderId"`).
- **`dbObjectSource`.** `usage: true` asks for the usage line without a quota, and `limit` is clamped to 1 to 100.
- **`s3.db.record` names.** A name follows the rule of an uploaded file name, and the default name from the key is fitted to it.

#### Breaking changes

- **Create schema `2.3.0` on a new database.** `storage_object.filename` is `name`, and `e_tag` is `etag`. `route` is `varchar(64)` and `acl` is `varchar(16)`. `storage_object_scope_filename_idx` is `storage_object_scope_name_idx` on `(scope, status, search_name)`, and the unique `storage_folder_scope_path_uk` is the plain index `storage_folder_scope_path_idx`. On MySQL, `name` uses `utf8mb4_bin` like every other text column. Generate the Drizzle or Prisma schema again with `runCli`, or call `migrate(client)` on an empty database. A database at another version throws.
- **`filename` is `name`.** Read `StorageObject.name` and `DbClientObject.name`. Send `name` in `PATCH /db/object`, `api.db.updateObject({ name })`, and `s3.db.objects.update(ref, { name })`. The sort field is `"name"`.
- **`authorize`: `folder` and `folderId` are where the target is now.** A move of an object and a rename or move of a folder report the new place in `destination`, not in `folder`. `POST /db/folder` reports the parent in `folder` and the new path in `destination.folder`. Read `destination?.folder` where a rule read `folder` for those calls.
- **A flat listing asks `authorize` for the whole scope.** `GET /db/objects` without `folderId` passes `folder: null`, `folderId: null`, and `recursive: true`. A rule that returns `false` for `recursive` now refuses it: list with a `folderId`, or allow `recursive` at the root.
- **Folder operations have their own names.** `resolveScope`, `authorize`, and a `quota` function receive `"folder.create"` for `POST /db/folder`, `"folder.update"` for `PATCH /db/folder`, and `"folder.delete"` for `DELETE /db/folder`. `"update"` is `PATCH /db/object` only.
- **The stores take the scope first.**
  - `s3.db.objects.list({ scope, ...filter })` → `s3.db.objects.list(scope, filter)`.
  - `s3.db.objects.count({ scope, ...filter })` → `s3.db.objects.count(scope, filter)`.
  - `s3.db.objects.getUsage(scope)` → `s3.db.objects.usage(scope)`.
  - `ObjectFilter` and `ListObjectsInput` have no `scope`.
- **`s3.db.folders.retain` is removed.** The plugin puts a folder back itself after it writes into one.
- **Ask for `usage` when there is no quota.** `GET /db/objects` sends `usage` on the first page when the plugin sets a `quota`, or when the query has `usage=true`. Pass `dbObjectSource(api.db, { usage: true })` or `api.db.listObjects({ usage: true })` to keep the usage line without a quota.
- **`DimahS3DB` is `DimahS3Db`.**
- **Import `migrate` from `@dimah-s3/db`.** `@dimah-s3/db/cli` exports `runCli` only.
- **Client types name the object.** `DbClientGetInput` → `DbClientGetObjectInput`, `DbClientUpdateInput` → `DbClientUpdateObjectInput`, `DbClientListInput` → `DbClientListObjectsInput`, and `DbClientListResponse` → `DbClientListObjectsResponse`.
- **`@dimah-s3/db/client` does not export `StorageObjectStatus`.** Use `DbClientObjectStatus`, which `@dimah-s3/db` exports too. `StorageObjectStatus` stays on `@dimah-s3/db`.
- **A scope cannot be empty or have whitespace at either end.** `resolveScope` returning one fails the call with `500 INTERNAL_ERROR` and logs the reason.
- **A folder name cannot start or end with whitespace.** It is `FOLDER_INVALID`.
- **`s3.db.record` checks `name` like an upload.** It is 1 to 255 UTF-8 bytes with no control or bidi characters, and may contain `/`. A name of up to 255 characters that is longer than 255 bytes is now a `VALIDATION_ERROR`.
