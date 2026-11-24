## @dimah-s3/db@2.2.0

### Hooks after db endpoint changes

`db()` runs a hook once a db endpoint saved its change, so an activity log, a cache, or a search index can follow renames, moves, and folders without wrapping the HTTP handler. [Change hooks](https://s3.dimah.dev/docs/db/lifecycle-hooks#change-hooks).

- **`onObjectUpdated`.** After `PATCH /db/object` renamed, moved, or set the attributes of an object, with the row `before` and `after`.
- **`onFolderCreated`, `onFolderUpdated`, `onFolderDeleted`.** After `POST`, `PATCH`, and `DELETE /db/folder`, with the `folder`, `before` and `after`, or `folder` and `recursive`. A `PATCH` that changes neither the name nor the parent does not run `onFolderUpdated`. Two `DELETE` calls at once for the same folder can each run `onFolderDeleted`.
- **Contexts.** Each one is the caller's `ScopeContext` with its `scope`, so it has the `session`. `DbChangeContext`, `DbObjectUpdatedContext`, `DbFolderCreatedContext`, `DbFolderUpdatedContext`, `DbFolderDeletedContext`, and `DbHook` are exported.
- **Scope.** They run for `dbClient()` calls; `s3.db.objects` and `s3.db.folders` do not run them. A throw fails the call, and the change stays.

## @dimah-s3/db@2.1.0

### Plugins built on db() reuse its checks

`s3.db.access` runs the scope and ownership checks of the db endpoints for another plugin, so it needs no `resolveScope` of its own. [s3.db.access](https://s3.dimah.dev/docs/db/api#s3dbaccess).

- **`s3.db.access`.** `scope(call, target)`, `object(call, target, ref)`, and `folder(call, target, folderId)` resolve the caller with your `resolveScope`, check that the target is theirs, and run your `authorize`.
- **`operation: "plugin"`.** `ScopeOperation` has `plugin`, and `ScopeContext` a `plugin: { id, action }`, for those calls. An `authorize` with an exhaustive `switch` on `operation` needs a case for it.
- **`s3.db.objects.findById(id)`.** Loads a row by its id.
- **`DbEndpoints`.** Exported, so a module that exports a `dimahS3()` instance with `db()` can emit declarations.

## @dimah-s3/db@2.0.0

### Search and sort `db()` object listings

`GET /db/objects` (`api.db.listObjects`) and `s3.db.objects.list` take `search` and `sort`.

- `search` keeps rows whose `name` contains the text. Case, accents, and look-alike letters do not count, the same on SQLite, PostgreSQL, and MySQL, and `%` and `_` are plain text.
- `sort` is `{ field, direction }` with `field` set to `createdAt`, `updatedAt`, `size`, or `name`. The default stays `createdAt` newest first. Ties break on row id, and rows without a value (a pending row's `size`) come last in both directions.
- `nextCursor` carries the filters and sort it was made under. Send it back with the same ones; under others it is ignored and the listing starts from the first row.

`dbObjectSource(api.db, …)` from `@dimah-s3/db/client` forwards the list's search text and its `name`, `size`, and `updatedAt` sort, so `ObjectListSearch` and `ObjectListSortMenu` work with `db()`. Sorting by date orders by the row's `updatedAt`, the same value `getFile().updatedAt` returns. New types: `DbListSort`, `DbListSortField`.

### Object list: sources, selection, and composable UI

The file list is rebuilt around three layers you can use apart.

**`useObjectList` (`@dimah-s3/react`)** takes a source: `query` plus `getId` (required) and `getFile` (name, `objectKey`, `size`, `contentType`, `updatedAt`, `previewUrl`). New on the return: `entries` (folders then files, each with a unique `key`), `sort` / `setSort`, `search` / `setSearch` (sent to the query as `sort` and `search`), `status`, `retry`, `goUp`, `setItems` / `setFolders` / `removeItems` for local edits, and the source's `uploadOptions` and `createFolder`. `refresh()` reloads every page on screen instead of only the first. A new sort or search keeps the rows on screen while it loads; opening a folder clears the search. `sort`, `search`, and `parent` can each be controlled.

**`useObjectListSelection`** is new and headless: `toggle` with Shift ranges, `select`, `selectAll`, `clear`, `single` / `multiple` modes, `isSelectable`, and `persist` to keep files from other folders.

**`memoryObjectSource`** from `@dimah-s3/react/engine` serves records you hold, with folders from a path, search, sort, pages, usage, and `limits`. **`useFormatDate`** formats dates for the `S3Provider` locale.

**`dbObjectSource(api.db, { route, folders })`** from `@dimah-s3/db/client` lists one `db()` folder at a time, forwards the list's search and sort, and gives the list `uploadOptions` and `createFolder`.

**`ObjectList` (`@dimah-s3/ui`)** takes the hook returns — `list`, `selection`, `upload`, `download`, `share`, `delete` — and gains a grid view, search, sort, keyboard navigation (arrows, Space, Backspace), paste-to-upload, a Load more mode, and default file menus. Pass `children` to compose the parts: `ObjectListHeader`, `ObjectListBreadcrumb`, `ObjectListSearch`, `ObjectListSortMenu`, `ObjectListViewToggle`, `ObjectListSelectionBar`, `ObjectListBulkDelete`, `ObjectListUsage`, `ObjectListUploadStatus`, `ObjectListContent`, `ObjectListRow`, `ObjectListTile`, `ObjectListEmpty`, and `useObjectListContext`. Deleting a file drops it from the rows at once, then reloads.

### Breaking changes

- `useObjectList` requires `getId`. The query input adds `sort` and `search`.
- `ObjectList` no longer takes `getKey`, `getLabel`, `getDescription`, `getFileName`, `getFileType`, `getPreviewUrl`, or `getObjectKey` — return those from `getFile` on the source. `selectable` and `onSelectionChange` are replaced by `selection={useObjectListSelection(list)}`. `header` is now `toolbar`. `renderItem` / `renderFolder` become `renderEntry`; `renderActions`, `renderMeta`, and `renderFolderActions` become entry-based `renderActions`, `renderMeta`, and `renderDescription`. `emptyTitle` / `emptyDescription` become `empty={<ObjectListEmpty title=… />}`. `list` must be a `useObjectList` return.
- `ObjectListMenu` is renamed `ObjectListItemMenu`. Inside a list every prop is optional: the list is the `Delete` root, so it owns the confirm dialog.
- `@dimah-s3/db/client`: `dbObjectQuery` and `dbObjectListAccessors` are replaced by `dbObjectSource(api.db, { route, folders })`. Read a row's file fields with `source.getFile(row)`.
- `ObjectListView` (the old list-state type) is removed; the name now means the `"list" | "grid"` view.

### Schema 2.3.0: folder ids, attributes, and generated tables

The `db()` plugin uses database schema `2.3.0`. A folder is a row with an id, an object stores `folderId`, and S3 metadata (`s3Metadata`) is split from your own typed `attributes`. `storage_folder` stores `parent_id` (`""` is the root), `name`, and a cached `path`. Create the schema on a new database. A `1.x` database and a `2.0.0` beta database are not upgraded.

- **Setup without FumaDB imports.** Import adapters from `@dimah-s3/db/adapters/drizzle`, `/adapters/kysely`, or `/adapters/prisma`, and generate the Drizzle tables or Prisma models with `runCli` from `@dimah-s3/db/cli`.
- **New options:** `getSession(request)` (called at most once per request), `authorize(context)` after the ownership check, `quota` as an object or a function of the session, and `attributes: { schema, toClient?, maxBytes? }` with any Standard Schema validator.
- **New endpoints and actions:** `GET /db/object` (`getObject`), `PATCH /db/object` (`updateObject`, for `name`, `folderId`, and `attributes`), `POST /db/folder` (`createFolder` with `{ parentId, name }`), `PATCH /db/folder` (rename with `name`, move with `parentId`), and `DELETE /db/folder` (`deleteFolder` by `id`). An upload's `clientMetadata.folderId` must name a folder that already exists.
- **`dbObjectSource(api.db, { route, folders })`** lists one folder at a time. `parent` is a folder id (`null` is the root). It provides `uploadOptions(parent)` and `createFolder({ parent, name })` so `ObjectList` uploads into the open folder and creates folders.
- **Safer lifecycle.** Upload tickets are bound to the scope. A pending row expires with its ticket. Confirm is a compare-and-set, so a replayed confirm returns the stored row. Quota is checked again against the verified size at confirm. An overwrite keeps the old object listed and downloadable until the new one is confirmed, with its folder, attributes, and `createdAt`.
- **Purge.** `s3.db.purgeStale({ limit })` claims each stale row for a 15-minute lease, aborts its multipart upload, and deletes an object only when its upload marker still matches. A failed row is retried after the lease. `s3.db.pruneDeleted({ olderThan })` removes soft-deleted rows.
- **`s3.db.checkSchema()`** fails fast at startup when the database is not at `2.3.0`.
- **MySQL collations.** Text columns compare byte for byte (`utf8mb4_bin`). The name sort reads the folded `search_name`, so it ignores case and accents on every database.

- **Safer overwrites and confirms.** A retried confirm after a later overwrite started is a replay, not a rejection that deleted the live object. `upsertPending` is a real compare-and-set on the row it read, and a re-upload over a deleted row gets a new row id. When the server deletes `upload.object().previousKey`, its row is retired too, so it stops counting toward the quota.
- **Quota** counts the declared bytes of an overwrite in flight.
- **Folders.** Creating and deleting a folder are race-safe: a delete that loses to an upload restores the folder. Every ancestor is checked in one query.
- **Listings.** `contentType` accepts `type/*` (`image/*`). With `search`, the first page lists only the child folders whose name contains it.
- **Tenant isolation.** A key another scope holds is `OBJECT_NOT_FOUND` on download, delete, read, update, confirm, and the multipart calls, the same as a missing key, so a caller cannot learn which keys exist. `objects.update` is pinned to the row that was checked.
- **Purge** returns `{ purged, failed, skipped, more }`. A row whose route has no S3 client fails and is kept, instead of dropping the row and orphaning its object. A database at a newer schema says to upgrade `@dimah-s3/db`.
- **Deleting a soft-deleted object again succeeds,** like a plain S3 delete.
- `PATCH /db/object` checks access before it runs your attributes schema, and `attributes: null` clears them.

### Breaking changes

- **Schema `2.3.0` is created, not upgraded.** `sql/upgrade/` is gone. Create the tables on a new database with your ORM from the generated schema, or with `migrate(client)` from `@dimah-s3/db` on an empty database. A database at any other version throws.
  - `metadata` is split into `s3Metadata` and `attributes`.
  - An object stores `folder_id` and `upload_token`. `storage_folder` stores `parent_id`, `name`, a cached `path`, and `updated_at`. Rows have a `purging` status, new indexes, and a required `name`.
- **Setup.** Remove `fumadb` and the `fumadb/cuid` path alias from your app. `fumadb` is now a pinned dependency of `@dimah-s3/db`, and its adapters are re-exported. Drizzle users must keep every table key of the generated schema, including `private_dimah_s3_settings`. The `drizzle-orm` peer is now `>=1.0.0-rc.5 <2.0.0`: the Drizzle adapter and tables need `drizzle-orm` 1.0.0-rc.5 or later, and 0.44 and 0.45 are no longer supported. Upgrade `drizzle-orm` first.
  - The copy-paste schemas in `src/schema/examples/` are no longer published. Generate the schema with `runCli` → `generate`.
- **Options.**
  - `resolveScope` receives `{ request, locals, session, operation, route? }`. `operation` gains `"read"` for `GET /db/object`. It runs once per call and target, not once per `Request`, so two `s3.api` calls with the same `Request` but different `locals` resolve separately. `getSession` is still cached per `Request`.
  - An upload on a `replace: "overwrite"` route that replaces an active object runs `authorize` with `object` set to that object. `folderId` is that object's folder id, not `clientMetadata.folderId`.
  - `authorize` replaces `createObjectAccessGuard`. `quota` accepts a function and replaces `createQuotaGuard`. Both helpers are removed.
  - `pendingTtlMs` is removed: pending rows expire with the upload ticket.
  - Overwrites are set per route with `plugins: { db: { replace: "overwrite" } }`.
  - `plugins: { db: false }` still turns tracking off for a route. Such a route issues unbound tickets and logs a warning at startup when its download or delete has no guard.
  - `TClientAttributes` defaults to the schema output.
- **Behavior.**
  - `s3.put` now tracks rows.
  - Usage ignores expired pending rows. `QUOTA_EXCEEDED` is now 403.
  - An upload to a key that purge is cleaning up returns `CONFLICT`.
- **Store (`s3.db.objects`).** `listByScope` is now `list(scope, filter)`, `countByScope` is `count(scope, filter)`, and `getScopeUsage` is `usage(scope)`. `findByScopeKey`, `findActive`, `deleteByIds`, the `offset` option, and `s3.db.client` are removed. `deletePending` is replaced by `cancelUpload` and `discardUpload`.
- **Purge.** `purgeStalePendingObjects` is replaced by `s3.db.purgeStale({ limit })` and `s3.db.pruneDeleted({ olderThan })`. A number for `olderThan` is a timestamp in milliseconds, not a duration.
- **HTTP.**
  - `GET /db/objects` drops `offset` and `prefix` (they now return `400`) and takes `folderId`, where `""` is the root. `usage`, `limits`, and `folders` come on the first page only, and `nextCursor` is always present. A cursor made under other filters restarts at the first page.
  - `GET /db/objects` returns `400` for `status=purging`. The `status` of `DbClientListObjectsInput` and `DbObjectSourceOptions` no longer allows `purging`.
  - Body endpoints accept JSON only.
  - When routes use more than one bucket, `GET` and `PATCH /db/object` require `bucket`.
- **Client (`@dimah-s3/db/client`).**
  - `DbClientObject` gains `folderId` (`null` is the root), `updatedAt`, and `attributes`. `updatedAt` is a sort field of its own.
  - `dbObjectQuery` and `dbObjectListAccessors` are replaced by `dbObjectSource(api.db, { route, folders })`, whose `parent` is a folder id (`null` is the root). `getFile().updatedAt` is the row's `updatedAt`, and sorting by date uses the same field.
  - `DbObjectListSource`, `DbObjectQueryInput`, `DbObjectQueryOptions`, `DbObjectQueryPage`, `DbObjectListAccessors`, and `DbObjectListAccessorsOptions` are removed. Read a row's file fields with `source.getFile(row)`, and use the `DbObjectSource*` types.
- **Removed exports.** `v1`, `conflict`, `forbidden`, `notFound`, `unauthorized`, `createStorageObjectStore`, `toPendingMultipartResume`, `PendingMultipartResume`, `FindPendingMultipartInput`, `ListByScopeInput`, `ScopeUsage`, `ScopeResolver`, `createObjectAccessGuard`, `createQuotaGuard`, `purgeStalePendingObjects`, and their option types. React's resume record now stores the upload ticket, so the multipart resume helpers are gone. `DbClientGetObjectInput`, `DbClientListObjectsInput`, and `DbClientListObjectsResponse` are exported from `@dimah-s3/db/client` only.
- **New root exports:** `DB_SCHEMA_VERSION`, `migrate`, `DbAttributesOptions`, `DbQuotaOption`, `DbRouteOptions`, `StorageFolder`, `DbClientFolder`, `DbQuota`, `DbUsage`, `StandardSchemaV1`, `PurgeStaleOptions`, `PruneDeletedOptions`, and the store input and page types. `runCli` from `@dimah-s3/db/cli` takes a `DimahS3DbClient`.
- **`resolveScope` sees only the caller.** `ScopeContext` is `{ request, locals, session, operation, route? }`. `key`, `folder` (the cached path), `folderId`, and `clientMetadata` are on `AuthorizeContext`. The scope is resolved once per call, operation, and route.
- **`authorize`** receives the stored row (`StorageObject`, with `scope`, `s3Metadata`, and the stored attributes), not the browser view.
- **New codes.** An upload to a key that holds an active object, without `replace: "overwrite"`, fails with `OBJECT_EXISTS` instead of `CONFLICT`. Creating an existing folder fails with `FOLDER_EXISTS`. `CONFLICT` stays for purge in progress and lost races.
- **Ownership errors.** A row of another scope is `OBJECT_NOT_FOUND` (`404`), not `FORBIDDEN`. An upload to a key another scope holds is still `FORBIDDEN`.
- **`s3.db.objects`** is `DbObjects`: `find`, `list`, `count`, `usage`, and `update`, which takes `folderId` (`FOLDER_INVALID` or `FOLDER_NOT_FOUND`). Uploads do not create folders. The lifecycle methods (`upsertPending`, `markActive`, `cancelUpload`, `discardUpload`, `softDelete`, `hardDelete`, `findStale`, `claimStale`, `deletePurged`, `pruneDeleted`) are internal: use `s3.db.pruneDeleted` and the server delete path. `s3.db.folders` (`DbFolders`) validates every cached path. The `StorageObjectStore`, `StorageFolderStore`, `MarkActiveInput`, and `UpsertPendingInput` exports are replaced by `DbObjects` and `DbFolders`.
- **Folder depth.** A cached folder path deeper than 32 levels, or longer than 1024 UTF-8 bytes, is `FOLDER_INVALID`.
- **HTTP.** `GET /db/objects` no longer returns `scope`: the tenant id stays on the server.
- **Client.** `DbClientRequestInit` is removed: every `api.db` action takes core's `S3RequestOptions`, and per-call `headers` are sent. `DbClientListObjectsInput.folderId` accepts `null` for the root. `route` is `S3RouteName`, and `DbClientObject.status` is `DbClientObjectStatus` (no `purging`).
- **Purge.** `purgeStale` resolves `PurgeStaleResult` instead of `{ purged }`.

### Upgrade to 2.0

`2.0.0` reworks the protocol, the hooks, and the components of every `@dimah-s3/*` package, and moves `db()` to database schema `2.3.0`. Keep every `@dimah-s3/*` package on the same version. The [upgrade guide](https://s3.dimah.dev/docs/migration-2-0) walks through each step, and each package's changelog lists its changes in full.

- **Upload tickets.** Presign and multipart init return a signed ticket, and confirm and every later multipart call send only `{ ticket }`.
- **One error catalog.** Every error is an `APIError` with a catalog `code`, a `status`, and typed `params`.
- **Per-key React state.** Hooks keep state per key, a repeated key joins the running call, and every action returns an outcome.
- **Composable UI.** `Upload*`, `Download*`, and `Delete*` families replace the preset buttons, and toasts come from `UploadToasts`, `DownloadToasts`, and `DeleteToasts`.
- **Folders in `db()`.** A folder is its id, an object stores `folderId`, typed `attributes` are separate from S3 metadata, and the Drizzle tables and adapters are prebuilt.

### Breaking changes

- **Set `DIMAH_S3_SECRET`.** Generate it with `openssl rand -base64 32` and use the same value on every instance, or pass `dimahS3({ secret })`. Without it, uploads return `500` outside `development` and `test`.
- **Set `requestChecksumCalculation: "WHEN_REQUIRED"`** on the `S3Client` you pass to `dimahS3()`.
- **Install `@dimah-s3/core`** next to `@dimah-s3/react` and import `APIError`, `S3_ERROR_CODES`, and the protocol helpers from it. Import plain functions such as `uploadFile`, `memoryObjectSource`, and the display formatters `formatFileSize` and `truncateFileName` from `@dimah-s3/react/engine`.
- **React 19.2** is required by `@dimah-s3/react` and `@dimah-s3/ui`, and `@fuma-translate/react` is a peer to install.
- **Replace the preset components** (`UploadButton`, `DownloadButton`, `ProgressDownloadButton`, `DeleteButton`) with the families, and mount one toast component per hook plus one `<Toaster />`.
- **Import schemas from `@dimah-s3/core/schema`.** The root of `@dimah-s3/core` no longer ships Zod, so `uploadBodySchema` and the other schemas moved there.
- **Proxy downloads need `download.mode: "proxy"`.** `/file` refuses routes in presign mode with `404 FEATURE_DISABLED`.
- **Create the `db()` schema `2.3.0` on a new database.** There is no upgrade from `1.x` or from a `2.0.0` beta database. Generate the Drizzle or Prisma schema with `runCli`, or call `migrate(client)` on an empty database, and remove `fumadb` from your app. With Drizzle, upgrade `drizzle-orm` to 1.0.0-rc.5 or later first. A folder is its id (`folderId`). Uploads send `clientMetadata.folderId` for a folder that already exists.

### One database schema

`@dimah-s3/db` reads schema `2.3.0` only. A database already at `2.3.0` is unchanged.

### Breaking changes

- **No upgrade from another schema.** `sql/upgrade/` is gone, and `migrate(client)` only creates schema `2.3.0`. Create the tables on a new database with your ORM from the generated schema, or `migrate(client)` on an empty database. A database at any other version, including `1.x` and `2.0.0`, throws. See [Upgrade the database](https://s3.dimah.dev/docs/db/upgrade).
- **`v2` is no longer exported.** The schema is internal. `DB_SCHEMA_VERSION` is `2.3.0`.

### Folders are rows with ids

A folder is its id. An object stores `folderId` instead of a path. Renaming or moving a folder rewrites the cached paths under it and leaves every object id as it is. `PATCH /db/folder` renames (`name`) and moves (`parentId`). `createFolder` creates one folder inside a parent that already exists. An upload's `clientMetadata.folderId` must name that folder. The list's first page includes `trail`, from the root down to the open folder.

The database schema is `2.3.0`. Create it on a new database. A `1.x` database and a `2.0.0` beta database are not upgraded.

### Breaking changes

- **Schema `2.3.0` replaces every earlier schema.** `storage_object.folder` is now `folder_id`. `storage_folder` stores `parent_id` (`""` is the root), `name`, and a cached `path`, plus `updated_at`. Create the tables from the generated Drizzle or Prisma schema, or with `migrate(client)` on an empty database. A database at any other version throws.
- **Folder addresses are ids.** `GET /db/objects` takes `folderId` (`""` is the root). `PATCH /db/object` takes `folderId`. `POST /db/folder` takes `{ parentId, name }`. `PATCH /db/folder` takes `{ id, name?, parentId? }`. `DELETE /db/folder` takes `id`. `DbClientObject.folder` is `folderId`. `DbClientFolder` is `{ id, name, parentId, path, createdAt, updatedAt }`.
- **Uploads no longer create folders.** Set `clientMetadata.folderId` to an existing folder. A missing id is `FOLDER_NOT_FOUND` (`404`). `s3.db.folders.ensure` is removed. `create` takes `{ parentId, name }`, and `update` renames or moves.
- **`dbObjectSource` parents are folder ids.** Uploads send `clientMetadata.folderId`. The first page's `trail` fills the breadcrumb.

### Add columns to the Drizzle tables

`runCli` → `generate` writes the Drizzle tables into your app, so you can add columns to them. Keep the table and column names. A column you add must be nullable or have a default, because the plugin does not read or write it. Generating again overwrites the file.

### Folder ids in db()

`@dimah-s3/db` schema `2.3.0` addresses a folder by id. An object stores `folderId`. Renaming or moving a folder updates that folder and the cached paths under it. Create the schema on a new database. A `1.x` database and a `2.0.0` beta database are not upgraded. Details are in each package changelog and in [Upgrade the database](https://s3.dimah.dev/docs/db/upgrade).

### Breaking changes

- **Keep every `@dimah-s3/*` package on the same version.** `folder` on a `db()` object is `folderId`, and uploads send `clientMetadata.folderId` for a folder that already exists.

### Docs at s3.dimah.dev

Package homepages, the CLI link, and scaffolded registry entries use https://s3.dimah.dev. 1.x docs are at https://v1.s3.dimah.dev.

### Rename from the database list

`dbObjectSource` renames a file with `api.db.updateObject` (`name`, same `key` and `bucket`) and a folder with `api.db.updateFolder` (`name`). The stored object key stays. `folders: false` still renames files. A folder name that cannot be one path segment fails with `FOLDER_INVALID` before the request. The methods are set when `api.db` has those actions.

### Generate the db() schema with the CLI

`@dimah-s3/db` runs on FumaDB 0.7. Its schema declares the indexes, the MySQL index prefix lengths, and the collations, so `runCli` from `@dimah-s3/db/cli` writes complete Drizzle tables and Prisma models, and `migrate` creates complete tables with Kysely, on SQLite, PostgreSQL, and MySQL.

- **`generate` needs no connection.** `runCli(DimahS3Db.client(drizzleAdapter({ db: undefined, provider })))` writes the Drizzle tables, and `prismaAdapter({ prisma: undefined, provider })` the Prisma models. Run it again after you upgrade `@dimah-s3/db`. See [Database Setup](https://s3.dimah.dev/docs/db/setup).
- **`migrate` works on MySQL.** `migrate(client)` and the CLI's `migrate` command create the same tables and indexes.
- **Drizzle tables.** The generated file exports `storageObject`, `storageFolder`, `private_dimah_s3_settings`, and `relations`. Pass `relations` to `drizzle()`, or the three tables to your own `defineRelations()`. The tables need no `@paralleldrive/cuid2`.
- **Column types.** Text columns are `varchar` on every database: `key`, `path`, and `search_name` hold 1024 characters, `status` and `acl` 16, `route` and `upload_token` 64, and the others 255. `upload_id` stays `text`, and so does the settings `value`. Sizes are `bigint`, stored as `integer` on SQLite.
- **Code that queries the generated tables.** The Drizzle tables read `size` and `declaredSize` as JavaScript `bigint` (`mode: "bigint"`), so convert them before `JSON.stringify` or arithmetic with a `number`. `id` has no default: the plugin generates ids, so a row you insert yourself needs one. `s3.db.objects` returns sizes as numbers.
- **MySQL.** Text columns compare byte for byte (`utf8mb4_bin`). `key` and `path` are indexed on their first 512 characters, and timestamps are `datetime(3)`. Prisma has no collation attribute: add the collations to the generated migration.
- **Folder conflicts with Drizzle.** Renaming or moving a folder onto a taken name returns `FOLDER_EXISTS` through the Drizzle adapter too, instead of `500` `INTERNAL_ERROR`.

### Scopes and folder paths fit the database

`db()` checks the scope and the folder path against the limits of the columns and indexes that hold them, so a value the database would reject fails with a clear error first, the same way on SQLite, PostgreSQL, and MySQL.

- **Scopes.** `resolveScope` returns at most 255 characters, the length of the `scope` columns. A longer scope fails the call as a config error (`500` `INTERNAL_ERROR`, with the length in the server log) before any row is written.
- **Folder paths.** A cached folder path is at most 1024 UTF-8 bytes, like an S3 key, so the `(scope, path)` unique key stays under PostgreSQL's 2704-byte limit for an index entry. A create, rename, or move past it is `FOLDER_INVALID`.
- **Unique conflicts.** Folder and upload conflicts are read from FumaDB's `UniqueConstraintError`, on every adapter.

### UTC timestamps and PostgreSQL schemas

`@dimah-s3/db` runs on FumaDB 0.7.2.

- **Timestamps are UTC on every adapter.** On PostgreSQL and MySQL, the Kysely adapter writes and reads the timestamp columns in UTC, as Drizzle and Prisma do, whatever the time zone of the process. Instances in different zones agree on deadlines like `expiresAt`.
- **Tables in a PostgreSQL schema.** Create the client from `DimahS3Db.names.schema("storage")` to keep the tables in the `storage` schema. `migrate` creates it, the generated Drizzle tables declare it with `pgSchema("storage")`, and the generated Prisma models with `@@schema("storage")`. The settings table, `private_dimah_s3_settings`, stays in the search path. See [Database Setup](https://s3.dimah.dev/docs/db/setup).

### Search across folders in db()

`GET /db/objects` searches a folder and every folder below it, and search ignores case, accents, and look-alike letters the same way on SQLite, PostgreSQL, and MySQL.

- **`recursive`.** With `folderId`, `api.db.listObjects({ folderId, recursive: true })` lists the objects of that folder and every folder below it, up to 10,000 folders. At the root that is the whole scope. `folders` then holds every folder below that matches `search`, by name. `s3.db.objects.list` and `count` take `recursive` too.
- **`locations`.** Each page of a recursive listing carries the folders on the way to its rows. Walk `parentId` from a row's `folderId` to draw where it lives.
- **`total`.** The first page of a search carries the number of objects that match across every page.
- **Search text.** `search` matches a folded copy of the name, built with `normalizeSearchText` from `@dimah-s3/core`, so `invoice` finds `Invoice.PDF` on PostgreSQL too, and `%`, `_`, and `\` match as themselves. Folder names match the same way.
- **`s3.db.folders.descendants(scope, parentId, { search, limit })`** lists the folders below a folder at any depth, and **`s3.db.folders.ancestors(scope, ids)`** every folder on the way to some folders.
- **`dbObjectSource`** searches below the open folder (`searchScope: "folder"`) or the whole scope (`"all"`), sets `searchScopes`, and gives each result a `location`. Pass `recursiveSearch: false` to search the open folder only, for an `authorize` that refuses `recursive`.
- **Folder names with `_`, `%`, or `\`.** Renaming or moving a folder finds the folders below it through their parent ids, so such a name no longer misses its own subfolders or rewrites another folder's.

### Breaking changes

- **Create schema `2.3.0` on a new database.** `storage_object` and `storage_folder` gain a required `search_name` column. A database at an earlier version is not upgraded: regenerate the Drizzle or Prisma schema with `runCli`, or call `migrate(client)` on an empty database.
- **Search results change.** `search` is no longer a `LIKE` on the file name: case and accents do not count on any database, and `%` and `_` are no longer wildcards.
- **Check `recursive` in `authorize`.** A `list` call with `recursive: true` returns the objects of every folder below `folder`. An `authorize` that allows a folder and denies a folder inside it must now deny a recursive listing of the outer one, or that listing shows the inner folder's objects. Return `false` for `recursive` to keep listings to one folder, and pass `dbObjectSource(api.db, { recursiveSearch: false })` so the list searches the open folder only.

### Search reaches every folder

A search in the file list finds files in the open folder and every folder below it, or everywhere, and each result says where it lives. Search matches the same way in the database, in memory, and in the highlight: case, accents, and look-alike letters do not count. `@dimah-s3/db` moves to schema `2.3.0`, which you create on a new database. Each package changelog lists its own changes, and [Upgrade the database](https://s3.dimah.dev/docs/db/upgrade) covers the schema.

### Breaking changes

- **Keep every `@dimah-s3/*` package on the same version.** `dbObjectSource` sends `recursive` to `GET /db/objects`, which an older `@dimah-s3/db` rejects.
- **Review `authorize` rules that allow some folders and deny others.** A search now lists every folder below the open one with `recursive: true`. See the `@dimah-s3/db` changelog.

### Types resolve under NodeNext

The declaration files of `@dimah-s3/core`, `@dimah-s3/server`, `@dimah-s3/react`, and `@dimah-s3/db` import each other by their `.js` paths. A project with `moduleResolution` set to `NodeNext` or `Node16` gets the same types as one on `Bundler`.

- **`export *` names resolve.** Importing `buildObjectKey` or another re-exported helper from `@dimah-s3/core` no longer fails with `TS2305`.
- **Values keep their types.** `dimahS3`, `route`, `useUpload`, `db`, and the other re-exported values are no longer `any`. Code that passed `tsc` only because they were `any` now reports its type errors.
- **`skipLibCheck: false` passes.** `tsc` no longer reports `TS2834` or `TS2835` inside these packages.

### Record an object already in the bucket

`s3.db.record` writes an active row for an object the app already put in the bucket: a copy, an import, or a file another system wrote. It does not copy or delete the bytes.

- **Checks.** Every instance guard, then the route guard, runs first, with `operation: "plugin"` and `plugin: { id: "db", action: "record" }`. `resolveScope` and `authorize` then run with `operation: "record"`. The key must sit inside the route namespace (`KEY_INVALID`). The size, type, and eTag come from HeadObject. The route's `fileTypes` and `maxFileSize` apply. An empty object is `FILE_EMPTY`.
- **Quota.** An object that does not fit is refused, and no row is written. The object stays in the bucket.
- **Rows.** A second call for the same bytes returns the row. A different object at the key is `OBJECT_EXISTS`. A row an upload or purge holds is `CONFLICT`. A deleted row is replaced. A `folderId` must exist (`FOLDER_NOT_FOUND`). `null` and `""` are the root. `name` defaults to the last segment of the key.
- **Call.** Pass `{ headers }`, `{ request }`, or `{ locals }` the way you call `s3.api`. `locals` seeds the guards. Every failure is an `APIError`, as from `s3.api`.

### Breaking changes

- **Handle `operation: "record"` in `resolveScope` and `authorize`.** They receive it from `s3.db.record`. A switch that lists every scope operation needs a `record` case.

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

### Breaking changes

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

### One Node.js floor and bounded peer ranges

Every `@dimah-s3/*` package declares `engines.node` `>=22`, exports its `package.json`, and names the peer majors it is built against. Keep every `@dimah-s3/*` package on the same version.

- **`./package.json`.** Every package exports it, so a tool can read the installed version: `import pkg from "@dimah-s3/core/package.json" with { type: "json" }`.
- **`funding`.** Every package links the sponsor page.

### Breaking changes

- **Use Node.js 22 or newer.** Every package declares `engines.node` `>=22`. Only `@dimah-s3/cli` declared a floor before (`>=20.19`).
- **Check your peer versions.** Open-ended ranges such as `>=19.2` now end at the next major:
  - `@dimah-s3/react` and `@dimah-s3/ui`: `react` `^19.2.0`.
  - `@dimah-s3/ui`: `react-dom` `^19.2.0` (a new peer), `@base-ui/react` `^1.0.0`, `class-variance-authority` `^0.7.0`, `cn` `^0.5.2`, and `lucide-react` `>=0.400.0 <2`.
  - `@dimah-s3/server` and `@dimah-s3/db`: `@aws-sdk/client-s3` `^3.0.0`.
  - `@dimah-s3/db`: `kysely` `^0.29.8`.
- **Install `@aws-sdk/client-s3` next to `@dimah-s3/db`.** It is a required peer. It was marked optional, but the plugin imports it.

### Folder rows show what they hold

A folder row shows how many files it holds and how large it is, on the same line a file uses for its size and date.

- **The whole folder.** The count and the bytes include that folder and every folder below it. An empty folder is `0`. `memoryObjectSource` measures the records it holds. `GET /db/objects` sends `size` and `objectCount` on each folder of the page. The list's `usage` stays the whole scope.
- **`db.objects.usage(scope)`.** Still sums the scope. Pass `{ folderId, recursive: true }` to sum one folder yourself.
- **`ObjectListFolder`.** `size` and `objectCount` are optional. Leave them out when a source does not know, and the line stays empty.
- **Your own second line.** `renderDescription` still replaces it.

### db() on the plugin SDK

`db()` reads the resolved routes and runs `s3.db.record` through the plugin SDK, so every guard applies to it.

- **`s3.db.record` runs every guard.** Every plugin's instance guard runs, then the user's instance guard and the route guard. A guard another plugin adds, such as auth or a rate limit, now applies to it.
- **`s3.db.record` fails with an `APIError`.** An unexpected failure is logged, passed to `onError`, and becomes `500 INTERNAL_ERROR`, as from `s3.api`.
- **Guards name the db action.** A `/db/*` call carries `plugin: { id: "db", action }`, where `action` is the `dbClient()` method: `listObjects`, `getObject`, `updateObject`, `createFolder`, `updateFolder`, or `deleteFolder`.
- **`dbClient()` is typed by `db()`.** Its responses come from the endpoint types, so the client and the server stay in step.

### Breaking changes

- **Compare `plugin.action` in guards.** The instance and route guards no longer receive `operation: "record"` from `s3.db.record`: they receive `operation: "plugin"` with `plugin.action === "record"`.

### Move and delete folders from dbObjectSource

`dbObjectSource` moves files and folders and deletes folders with everything in them, through the endpoints `db()` already has.

- **Move.** `moveFile` sends the new `folderId` to `api.db.updateObject`, and `moveFolder` the new `parentId` to `api.db.updateFolder`. The object key stays. Set when `folders` is on.
- **Folder delete.** `listFolderKeys` pages through `GET /db/objects` with `recursive` and the source's filters, so the list can delete those objects with `useDelete`. `deleteFolder` then calls `api.db.deleteFolder({ id, recursive: true })`. Set when `folders` is on, and `deleteFolder` when `api.db` has it.
- **`DELETE /db/folder?recursive=true`.** Removes the folder and the folders below it, deepest first, as long as none of them holds an active or pending object. A folder with one is `FOLDER_NOT_EMPTY`; the empty folders removed before it stay removed. `authorize` sees the folder the call names. `api.db.deleteFolder` takes `recursive`.
- **`s3.db.folders.delete(scope, id, { recursive })`.** The same on the server.

### A plugin SDK for third-party plugins

Plugins get resolved routes, in-process calls behind the guards, their own error codes, a client typed by the server, and a test kit. Each package changelog lists its own changes. The [Plugins](https://s3.dimah.dev/docs/server/plugins) guide builds one end to end, and [Testing](https://s3.dimah.dev/docs/server/testing) covers `@dimah-s3/server/testing`. The [upgrade guide](https://s3.dimah.dev/docs/migration-2-0#update-plugins) lists what a plugin written for an earlier beta changes.

## @dimah-s3/db@2.0.0-beta.14 (beta)

### db() on the plugin SDK

`db()` reads the resolved routes and runs `s3.db.record` through the plugin SDK, so every guard applies to it.

- **`s3.db.record` runs every guard.** Every plugin's instance guard runs, then the user's instance guard and the route guard. A guard another plugin adds, such as auth or a rate limit, now applies to it.
- **`s3.db.record` fails with an `APIError`.** An unexpected failure is logged, passed to `onError`, and becomes `500 INTERNAL_ERROR`, as from `s3.api`.
- **Guards name the db action.** A `/db/*` call carries `plugin: { id: "db", action }`, where `action` is the `dbClient()` method: `listObjects`, `getObject`, `updateObject`, `createFolder`, `updateFolder`, or `deleteFolder`.
- **`dbClient()` is typed by `db()`.** Its responses come from the endpoint types, so the client and the server stay in step.

### Breaking changes

- **Compare `plugin.action` in guards.** The instance and route guards no longer receive `operation: "record"` from `s3.db.record`: they receive `operation: "plugin"` with `plugin.action === "record"`.

### Move and delete folders from dbObjectSource

`dbObjectSource` moves files and folders and deletes folders with everything in them, through the endpoints `db()` already has.

- **Move.** `moveFile` sends the new `folderId` to `api.db.updateObject`, and `moveFolder` the new `parentId` to `api.db.updateFolder`. The object key stays. Set when `folders` is on.
- **Folder delete.** `listFolderKeys` pages through `GET /db/objects` with `recursive` and the source's filters, so the list can delete those objects with `useDelete`. `deleteFolder` then calls `api.db.deleteFolder({ id, recursive: true })`. Set when `folders` is on, and `deleteFolder` when `api.db` has it.
- **`DELETE /db/folder?recursive=true`.** Removes the folder and the folders below it, deepest first, as long as none of them holds an active or pending object. A folder with one is `FOLDER_NOT_EMPTY`; the empty folders removed before it stay removed. `authorize` sees the folder the call names. `api.db.deleteFolder` takes `recursive`.
- **`s3.db.folders.delete(scope, id, { recursive })`.** The same on the server.

### A plugin SDK for third-party plugins

Plugins get resolved routes, in-process calls behind the guards, their own error codes, a client typed by the server, and a test kit. Each package changelog lists its own changes. The [Plugins](https://s3.dimah.dev/docs/server/plugins) guide builds one end to end, and [Testing](https://s3.dimah.dev/docs/server/testing) covers `@dimah-s3/server/testing`. The [upgrade guide](https://s3.dimah.dev/docs/migration-2-0#update-plugins) lists what a plugin written for an earlier beta changes.

## @dimah-s3/db@2.0.0-beta.13 (beta)

### Folder rows show what they hold

A folder row shows how many files it holds and how large it is, on the same line a file uses for its size and date.

- **The whole folder.** The count and the bytes include that folder and every folder below it. An empty folder is `0`. `memoryObjectSource` measures the records it holds. `GET /db/objects` sends `size` and `objectCount` on each folder of the page. The list's `usage` stays the whole scope.
- **`db.objects.usage(scope)`.** Still sums the scope. Pass `{ folderId, recursive: true }` to sum one folder yourself.
- **`ObjectListFolder`.** `size` and `objectCount` are optional. Leave them out when a source does not know, and the line stays empty.
- **Your own second line.** `renderDescription` still replaces it.

## @dimah-s3/db@2.0.0-beta.12 (beta)

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

### Breaking changes

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

### One Node.js floor and bounded peer ranges

Every `@dimah-s3/*` package declares `engines.node` `>=22`, exports its `package.json`, and names the peer majors it is built against. Keep every `@dimah-s3/*` package on the same version.

- **`./package.json`.** Every package exports it, so a tool can read the installed version: `import pkg from "@dimah-s3/core/package.json" with { type: "json" }`.
- **`funding`.** Every package links the sponsor page.

### Breaking changes

- **Use Node.js 22 or newer.** Every package declares `engines.node` `>=22`. Only `@dimah-s3/cli` declared a floor before (`>=20.19`).
- **Check your peer versions.** Open-ended ranges such as `>=19.2` now end at the next major:
  - `@dimah-s3/react` and `@dimah-s3/ui`: `react` `^19.2.0`.
  - `@dimah-s3/ui`: `react-dom` `^19.2.0` (a new peer), `@base-ui/react` `^1.0.0`, `class-variance-authority` `^0.7.0`, `cn` `^0.5.2`, and `lucide-react` `>=0.400.0 <2`.
  - `@dimah-s3/server` and `@dimah-s3/db`: `@aws-sdk/client-s3` `^3.0.0`.
  - `@dimah-s3/db`: `kysely` `^0.29.8`.
- **Install `@aws-sdk/client-s3` next to `@dimah-s3/db`.** It is a required peer. It was marked optional, but the plugin imports it.

## @dimah-s3/db@2.0.0-beta.11 (beta)

### Record an object already in the bucket

`s3.db.record` writes an active row for an object the app already put in the bucket: a copy, an import, or a file another system wrote. It does not copy or delete the bytes.

- **Checks.** The instance guard and the route guard run first. `resolveScope` and `authorize` then run with `operation: "record"`. The key must sit inside the route namespace (`KEY_INVALID`). The size, type, and eTag come from HeadObject. The route's `fileTypes` and `maxFileSize` apply. An empty object is `FILE_EMPTY`.
- **Quota.** An object that does not fit is refused, and no row is written. The object stays in the bucket.
- **Rows.** A second call for the same bytes returns the row. A different object at the key is `OBJECT_EXISTS`. A row an upload or purge holds is `CONFLICT`. A deleted row is replaced. A `folderId` must exist (`FOLDER_NOT_FOUND`). `null` and `""` are the root. `name` defaults to the last segment of the key.
- **Call.** Pass `{ headers }`, `{ request }`, or `{ locals }` the way you call `s3.api`. `locals` seeds the guards.

### Breaking changes

- **Handle `operation: "record"`.** `resolveScope`, `authorize`, and the instance and route guards receive it from `s3.db.record`. A switch that lists every operation needs a `record` case.

## @dimah-s3/db@2.0.0-beta.10 (beta)

### Types resolve under NodeNext

The declaration files of `@dimah-s3/core`, `@dimah-s3/server`, `@dimah-s3/react`, and `@dimah-s3/db` import each other by their `.js` paths. A project with `moduleResolution` set to `NodeNext` or `Node16` gets the same types as one on `Bundler`.

- **`export *` names resolve.** Importing `buildObjectKey` or another re-exported helper from `@dimah-s3/core` no longer fails with `TS2305`.
- **Values keep their types.** `dimahS3`, `route`, `useUpload`, `db`, and the other re-exported values are no longer `any`. Code that passed `tsc` only because they were `any` now reports its type errors.
- **`skipLibCheck: false` passes.** `tsc` no longer reports `TS2834` or `TS2835` inside these packages.

## @dimah-s3/db@2.0.0-beta.9 (beta)

### Search across folders in db()

`GET /db/objects` searches a folder and every folder below it, and search ignores case, accents, and look-alike letters the same way on SQLite, PostgreSQL, and MySQL.

- **`recursive`.** With `folderId`, `api.db.listObjects({ folderId, recursive: true })` lists the objects of that folder and every folder below it, up to 10,000 folders. At the root that is the whole scope. `folders` then holds every folder below that matches `search`, by name. `s3.db.objects.list` and `count` take `recursive` too.
- **`locations`.** Each page of a recursive listing carries the folders on the way to its rows. Walk `parentId` from a row's `folderId` to draw where it lives.
- **`total`.** The first page of a search carries the number of objects that match across every page.
- **Search text.** `search` matches a folded copy of the name, built with `normalizeSearchText` from `@dimah-s3/core`, so `invoice` finds `Invoice.PDF` on PostgreSQL too, and `%`, `_`, and `\` match as themselves. Folder names match the same way.
- **`s3.db.folders.descendants(scope, parentId, { search, limit })`** lists the folders below a folder at any depth, and **`s3.db.folders.ancestors(scope, ids)`** every folder on the way to some folders.
- **`dbObjectSource`** searches below the open folder (`searchScope: "folder"`) or the whole scope (`"all"`), sets `searchScopes`, and gives each result a `location`. Pass `recursiveSearch: false` to search the open folder only, for an `authorize` that refuses `recursive`.
- **Folder names with `_`, `%`, or `\`.** Renaming or moving a folder finds the folders below it through their parent ids, so such a name no longer misses its own subfolders or rewrites another folder's.

### Breaking changes

- **Create schema `2.2.0` on a new database.** `storage_object` and `storage_folder` gain a required `search_name` column. A database at `2.1.0` is not upgraded: regenerate the Drizzle or Prisma schema with `runCli`, or call `migrate(client)` on an empty database.
- **Search results change.** `search` is no longer a `LIKE` on `filename`: case and accents do not count on any database, and `%` and `_` are no longer wildcards.
- **Check `recursive` in `authorize`.** A `list` call with `recursive: true` returns the objects of every folder below `folder`. An `authorize` that allows a folder and denies a folder inside it must now deny a recursive listing of the outer one, or that listing shows the inner folder's objects. Return `false` for `recursive` to keep listings to one folder, and pass `dbObjectSource(api.db, { recursiveSearch: false })` so the list searches the open folder only.

### Search reaches every folder

A search in the file list finds files in the open folder and every folder below it, or everywhere, and each result says where it lives. Search matches the same way in the database, in memory, and in the highlight: case, accents, and look-alike letters do not count. `@dimah-s3/db` moves to schema `2.2.0`, which you create on a new database. Each package changelog lists its own changes, and [Upgrade the database](https://s3.dimah.dev/docs/db/upgrade) covers the schema.

### Breaking changes

- **Keep every `@dimah-s3/*` package on the same version.** `dbObjectSource` sends `recursive` to `GET /db/objects`, which an older `@dimah-s3/db` rejects.
- **Review `authorize` rules that allow some folders and deny others.** A search now lists every folder below the open one with `recursive: true`. See the `@dimah-s3/db` changelog.

## @dimah-s3/db@2.0.0-beta.8 (beta)

### Timestamps written by Kysely outside UTC

The Kysely adapter now reads and writes timestamps in UTC. Rows an earlier beta wrote from a Kysely process outside UTC need a one-time rewrite.

### Breaking changes

- **Kysely timestamps are UTC on PostgreSQL and MySQL.** Earlier betas wrote them in the local time of the process. If a Kysely process outside UTC wrote your rows, they now read shifted by its offset. Rewrite them once with the query on [Upgrade the schema](https://s3.dimah.dev/docs/db/upgrade#timestamps-written-by-kysely-outside-utc). Rows written by Drizzle or Prisma, or by a Kysely process in UTC, are unchanged.

### UTC timestamps and PostgreSQL schemas

`@dimah-s3/db` runs on FumaDB 0.7.2.

- **Timestamps are UTC on every adapter.** On PostgreSQL and MySQL, the Kysely adapter writes and reads the timestamp columns in UTC, as Drizzle and Prisma do, whatever the time zone of the process. Instances in different zones agree on deadlines like `expiresAt`.
- **Tables in a PostgreSQL schema.** Create the client from `DimahS3DB.names.schema("storage")` to keep the tables in the `storage` schema. `migrate` creates it, the generated Drizzle tables declare it with `pgSchema("storage")`, and the generated Prisma models with `@@schema("storage")`. The settings table, `private_dimah_s3_settings`, stays in the search path. See [Database Setup](https://s3.dimah.dev/docs/db/setup).

## @dimah-s3/db@2.0.0-beta.7 (beta)

### Generate the schema again

`@dimah-s3/db` runs on FumaDB 0.7.1. The settings `value` column is `text` in the Drizzle tables and Prisma models `generate` writes, as in the table `migrate` creates. Run `generate` again: the ORM widens `value` from `varchar(255)` to `text`.

- **Sizes in the generated Drizzle tables are `bigint`.** Since beta.6 they read `size` and `declaredSize` with `mode: "bigint"`, where the shipped tables used `mode: "number"`. Code that queries the tables directly gets a `bigint`. `s3.db.objects` still returns numbers. The generated tables also drop the shipped `$type` on `status` and `s3Metadata`, and give `id` no default.
- **Before `drizzle-kit` changes a PostgreSQL database from the shipped files,** run the length check on [Upgrade the schema](https://s3.dimah.dev/docs/db/upgrade#postgresql). The cast it writes truncates a longer value.

### Breaking changes

- **Folder paths are capped at 1024 UTF-8 bytes, not 1024 characters.** A create, rename, or move that makes a path longer is `FOLDER_INVALID`. Folders already stored keep working until they are renamed or moved.

### Scopes and folder paths fit the database

`db()` checks the scope and the folder path against the limits of the columns and indexes that hold them, so a value the database would reject fails with a clear error first, the same way on SQLite, PostgreSQL, and MySQL.

- **Scopes.** `resolveScope` returns at most 255 characters, the length of the `scope` columns. A longer scope fails the call as a config error (`500` `INTERNAL_ERROR`, with the length in the server log) before any row is written.
- **Folder paths.** A cached folder path is at most 1024 UTF-8 bytes, like an S3 key, so the `(scope, path)` unique key stays under PostgreSQL's 2704-byte limit for an index entry. A create, rename, or move past it is `FOLDER_INVALID`.
- **Unique conflicts.** Folder and upload conflicts are read from FumaDB's `UniqueConstraintError`, on every adapter.

## @dimah-s3/db@2.0.0-beta.6 (beta)

### Shipped schema files replaced by `generate`

A database at schema `2.1.0` from an earlier beta keeps working. Generate the schema for your ORM and point it at the generated file. See [Upgrade the schema](https://s3.dimah.dev/docs/db/upgrade).

### Breaking changes

- **`@dimah-s3/db/drizzle/sqlite`, `/drizzle/pg`, and `/drizzle/mysql` are removed, with `dimahS3Tables`.** Write the tables with `runCli` → `generate`, then import `relations` (or `storageObject`, `storageFolder`, and `private_dimah_s3_settings`) from the generated file.
- **`prisma/dimah-s3.prisma` and `sql/<dialect>.sql` are no longer published.** Generate the Prisma models with `runCli` → `generate`. With Kysely, create the tables with `migrate(client)`.
- **`drizzle-kit` and Prisma Migrate report small changes** against tables created from the shipped files: `varchar` lengths on PostgreSQL text columns, and the SQLite timestamp default. They do not change what the plugin reads. Apply them.
- **A database left at the empty `0.0.1` step is no longer recognized.** `migrate:up` stopped there before it created the tables. Drop `private_dimah_s3_settings`, the only table at that step, and run `migrate` again.

### Generate the db() schema with the CLI

`@dimah-s3/db` runs on FumaDB 0.7. Its schema declares the indexes, the MySQL index prefix lengths, and the collations, so `runCli` from `@dimah-s3/db/cli` writes complete Drizzle tables and Prisma models, and `migrate` creates complete tables with Kysely, on SQLite, PostgreSQL, and MySQL.

- **`generate` needs no connection.** `runCli(DimahS3DB.client(drizzleAdapter({ db: undefined, provider })))` writes the Drizzle tables, and `prismaAdapter({ prisma: undefined, provider })` the Prisma models. Run it again after you upgrade `@dimah-s3/db`. See [Database Setup](https://s3.dimah.dev/docs/db/setup).
- **`migrate` works on MySQL.** `migrate(client)` and the CLI's `migrate` command create the same tables and indexes.
- **Drizzle tables.** The generated file exports `storageObject`, `storageFolder`, `private_dimah_s3_settings`, and `relations`. Pass `relations` to `drizzle()`, or the three tables to your own `defineRelations()`. The tables need no `@paralleldrive/cuid2`.
- **Column types.** Text columns are `varchar` on every database: `key` and `path` hold 1024 characters, `status` 16, `upload_token` 64, and the others 255. `upload_id` stays `text`. Sizes are `bigint`, stored as `integer` on SQLite.
- **MySQL.** Keys, scopes, and folders compare byte for byte (`utf8mb4_bin`), and `filename` ignores case (`utf8mb4_unicode_ci`). `key` and `path` are indexed on their first 512 characters, and timestamps are `datetime(3)`. Prisma has no collation attribute: add the collations to the generated migration.
- **Folder conflicts with Drizzle.** Renaming or moving a folder onto a taken name returns `FOLDER_EXISTS` through the Drizzle adapter too, instead of `500` `INTERNAL_ERROR`.

## @dimah-s3/db@2.0.0-beta.4 (beta)

### Docs at s3.dimah.dev

Package homepages, the CLI link, and scaffolded registry entries use https://s3.dimah.dev. 1.x docs are at https://v1.s3.dimah.dev.

## @dimah-s3/db@2.0.0-beta.3 (beta)

### Rename from the database list

`dbObjectSource` renames a file with `api.db.updateObject` (`filename`, same `key` and `bucket`) and a folder with `api.db.updateFolder` (`name`). The stored object key stays. `folders: false` still renames files. A folder name that cannot be one path segment fails with `FOLDER_INVALID` before the request. The methods are set when `api.db` has those actions.

## @dimah-s3/db@2.0.0-beta.2 (beta)

### Folders are rows with ids

A folder is its id. An object stores `folderId` instead of a path. Renaming or moving a folder rewrites the cached paths under it and leaves every object id as it is. `PATCH /db/folder` renames (`name`) and moves (`parentId`). `createFolder` creates one folder inside a parent that already exists. An upload's `clientMetadata.folderId` must name that folder. The list's first page includes `trail`, from the root down to the open folder.

The database schema is `2.1.0`. Create it on a new database. A `2.0.0` beta database is not upgraded.

### Breaking changes

- **Schema `2.1.0` replaces `2.0.0`.** `storage_object.folder` is now `folder_id`. `storage_folder` stores `parent_id` (`""` is the root), `name`, and a cached `path`, plus `updated_at`. Recreate the tables from `sql/<dialect>.sql`, the Drizzle or Prisma schema, or `migrate(client)` on an empty database. A database at `2.0.0` throws.
- **Folder addresses are ids.** `GET /db/objects` takes `folderId` (`""` is the root). `PATCH /db/object` takes `folderId`. `POST /db/folder` takes `{ parentId, name }`. `PATCH /db/folder` takes `{ id, name?, parentId? }`. `DELETE /db/folder` takes `id`. `DbClientObject.folder` is `folderId`. `DbClientFolder` is `{ id, name, parentId, path, createdAt, updatedAt }`.
- **Uploads no longer create folders.** Set `clientMetadata.folderId` to an existing folder. A missing id is `FOLDER_NOT_FOUND` (`404`). `s3.db.folders.ensure` is removed. `create` takes `{ parentId, name }`, and `update` renames or moves.
- **`dbObjectSource` parents are folder ids.** Uploads send `metadata.folderId`. The first page's `trail` fills the breadcrumb.

### Folder ids in db()

`@dimah-s3/db` schema `2.1.0` addresses a folder by id. An object stores `folderId`. Renaming or moving a folder updates that folder and the cached paths under it. Recreate the database; a `2.0.0` beta database is not upgraded. Details are in each package changelog and in [Upgrade the database](https://v2.s3.dimah.dev/docs/db/upgrade).

### Breaking changes

- **Keep every `@dimah-s3/*` package on this beta.** `folder` on a `db()` object is now `folderId`, and uploads send `clientMetadata.folderId` for a folder that already exists.

## @dimah-s3/db@2.0.0-beta.1 (beta)

### One database schema

`@dimah-s3/db` reads schema `2.0.0` only. A database already at `2.0.0` is unchanged.

### Breaking changes

- **No upgrade from a 1.x database.** `sql/upgrade/1.0.0-2.0.0/` is gone, and `migrate(client)` only creates schema `2.0.0`. Create the tables on a new database with `sql/<dialect>.sql`, your ORM, or `migrate(client)` on an empty database. A database at any other version throws. See [Upgrade the database](https://v2.s3.dimah.dev/docs/db/upgrade).
- **`v2` is no longer exported.** The schema is internal. `DB_SCHEMA_VERSION` is still `2.0.0`.

### Copy the Drizzle schema into your app

Copy `src/drizzle/sqlite.ts`, `pg.ts`, or `mysql.ts` from the package into your schema when you want to add columns. Keep the table and column names. Importing `dimahS3Tables` from `@dimah-s3/db/drizzle/*` still works when you leave the tables as they are.

## @dimah-s3/db@2.0.0-beta.0 (beta)

### Search and sort `db()` object listings

`GET /db/objects` (`api.db.listObjects`) and `s3.db.objects.list` take `search` and `sort`.

- `search` keeps rows whose `filename` contains the text. It runs in the database (`LIKE` on SQL), so case follows its collation.
- `sort` is `{ field, direction }` with `field` set to `createdAt`, `updatedAt`, `size`, or `filename`. The default stays `createdAt` newest first. Ties break on row id, and rows without a value (a pending row's `size`) come last in both directions.
- `nextCursor` carries the filters and sort it was made under. Send it back with the same ones; under others it is ignored and the listing starts from the first row.

`dbObjectSource(api.db, …)` from `@dimah-s3/db/client` forwards the list's search text and sort, mapping `name` to `filename` and keeping `size` and `updatedAt`, so `ObjectListSearch` and `ObjectListSortMenu` work with `db()`. Sorting by date orders by the row's `updatedAt`, the same value `getFile().updatedAt` returns. New types: `DbListSort`, `DbListSortField`.

### Object list: sources, selection, and composable UI

The file list is rebuilt around three layers you can use apart.

**`useObjectList` (`@dimah-s3/react`)** takes a source: `query` plus `getKey` (required) and `getFile` (name, `objectKey`, `size`, `contentType`, `updatedAt`, `previewUrl`). New on the return: `entries` (folders then files, each with a unique `key`), `sort` / `setSort`, `search` / `setSearch` (sent to the query as `sort` and `search`), `status`, `retry`, `goUp`, `setItems` / `setFolders` / `removeItems` for local edits, and the source's `uploadOptions` and `createFolder`. `refresh()` reloads every page on screen instead of only the first. A new sort or search keeps the rows on screen while it loads; opening a folder clears the search. `sort`, `search`, and `parent` can each be controlled.

**`useObjectListSelection`** is new and headless: `toggle` with Shift ranges, `select`, `selectAll`, `clear`, `single` / `multiple` modes, `isSelectable`, and `persist` to keep files from other folders.

**`memoryObjectSource`** from `@dimah-s3/react/engine` serves records you hold, with folders from a path, search, sort, pages, usage, and `limits`. **`useFormatDate`** formats dates for the `S3Provider` locale.

**`dbObjectSource(api.db, { route, folders })`** from `@dimah-s3/db/client` lists one `db()` folder at a time, forwards the list's search and sort, and gives the list `uploadOptions` and `createFolder`.

**`ObjectList` (`@dimah-s3/ui`)** takes the hook returns — `list`, `selection`, `upload`, `download`, `share`, `delete` — and gains a grid view, search, sort, keyboard navigation (arrows, Space, Backspace), paste-to-upload, a Load more mode, and default file menus. Pass `children` to compose the parts: `ObjectListHeader`, `ObjectListBreadcrumb`, `ObjectListSearch`, `ObjectListSortMenu`, `ObjectListViewToggle`, `ObjectListSelectionBar`, `ObjectListBulkDelete`, `ObjectListUsage`, `ObjectListUploadStatus`, `ObjectListContent`, `ObjectListRow`, `ObjectListTile`, `ObjectListEmpty`, and `useObjectListContext`. Deleting a file drops it from the rows at once, then reloads.

### Breaking changes

- `useObjectList` requires `getKey`. The query input adds `sort` and `search`.
- `ObjectList` no longer takes `getKey`, `getLabel`, `getDescription`, `getFileName`, `getFileType`, `getPreviewUrl`, or `getObjectKey` — return those from `getFile` on the source. `selectable` and `onSelectionChange` are replaced by `selection={useObjectListSelection(list)}`. `header` is now `toolbar`. `renderItem` / `renderFolder` become `renderEntry`; `renderActions`, `renderMeta`, and `renderFolderActions` become entry-based `renderActions`, `renderMeta`, and `renderDescription`. `emptyTitle` / `emptyDescription` become `empty={<ObjectListEmpty title=… />}`. `list` must be a `useObjectList` return.
- `ObjectListMenu` is renamed `ObjectListItemMenu`. Inside a list every prop is optional: the list is the `Delete` root, so it owns the confirm dialog.
- `@dimah-s3/db/client`: `dbObjectQuery` and `dbObjectListAccessors` are replaced by `dbObjectSource(api.db, { route, folders })`. Read a row's file fields with `source.getFile(row)`.
- `ObjectListView` (the old list-state type) is removed; the name now means the `"list" | "grid"` view.

### Schema 2.0.0: folders, attributes, and prebuilt tables

The `db()` plugin moves to database schema `2.0.0`. Rows gain a logical `folder`, a `storage_folder` table holds empty folders, and S3 metadata (`s3Metadata`) is split from your own typed `attributes`.

- **Setup without FumaDB imports.** Import tables from `@dimah-s3/db/drizzle/sqlite`, `/drizzle/pg`, or `/drizzle/mysql` (`dimahS3Tables`), and adapters from `@dimah-s3/db/adapters/drizzle`, `/adapters/kysely`, or `/adapters/prisma`. Plain SQL lives in `sql/<dialect>.sql`, and a Prisma model file in `prisma/dimah-s3.prisma`.
- **New options:** `getSession(request)` (called at most once per request), `authorize(context)` after the ownership check, `quota` as an object or a function of the session, and `attributes: { schema, toClient?, maxBytes? }` with any Standard Schema validator.
- **New endpoints and actions:** `GET /db/object` (`getObject`), `PATCH /db/object` (`updateObject`, for `filename`, `folder`, and `attributes`), `POST /db/folder` (`createFolder`), and `DELETE /db/folder` (`deleteFolder`).
- **`dbObjectSource(api.db, { route, folders })`** lists one folder at a time with its folder rows, and provides `uploadOptions(parent)` and `createFolder(name)` so `ObjectList` uploads into the open folder and creates folders.
- **Safer lifecycle.** Upload tickets are bound to the scope. A pending row expires with its ticket. Confirm is a compare-and-set, so a replayed confirm returns the stored row. Quota is checked again against the verified size at confirm. An overwrite keeps the old object listed and downloadable until the new one is confirmed, with its folder, attributes, and `createdAt`.
- **Purge.** `s3.db.purgeStale({ limit })` claims each stale row for a 15-minute lease, aborts its multipart upload, and deletes an object only when its upload marker still matches. A failed row is retried after the lease. `s3.db.pruneDeleted({ olderThan })` removes soft-deleted rows.
- **`s3.db.checkSchema()`** fails fast at startup when the database is not at `2.0.0`.
- **Drizzle on MySQL.** The tables set the collations of `sql/mysql.sql`: `utf8mb4_bin`, with `utf8mb4_unicode_ci` on `filename`.

- **Safer overwrites and confirms.** A retried confirm after a later overwrite started is a replay, not a rejection that deleted the live object. `upsertPending` is a real compare-and-set on the row it read, and a re-upload over a deleted row gets a new row id. When the server deletes `upload.object().previousKey`, its row is retired too, so it stops counting toward the quota.
- **Quota** counts the declared bytes of an overwrite in flight.
- **Folders.** Creating and deleting a folder are race-safe: a delete that loses to an upload restores the folder. Every ancestor is checked in one query.
- **Listings.** `contentType` accepts `type/*` (`image/*`). With `search`, the first page lists only the child folders whose name contains it.
- **Tenant isolation.** A key another scope holds is `OBJECT_NOT_FOUND` on download, delete, read, update, confirm, and the multipart calls, the same as a missing key, so a caller cannot learn which keys exist. `objects.update` is pinned to the row that was checked.
- **Purge** returns `{ purged, failed, skipped, more }`. A row whose route has no S3 client fails and is kept, instead of dropping the row and orphaning its object. A database at a newer schema says to upgrade `@dimah-s3/db`.
- **Deleting a soft-deleted object again succeeds,** like a plain S3 delete.
- `PATCH /db/object` checks access before it runs your attributes schema, and `attributes: null` clears them.

### Breaking changes

- **Schema upgrade.** Run `sql/upgrade/1.0.0-2.0.0/<dialect>.sql`, or `migrate(client)` from `@dimah-s3/db/cli` with Kysely on SQLite or PostgreSQL. A 1.x database throws until it is upgraded.
  - `metadata` is split into `s3Metadata` and `attributes`.
  - New `folder` and `upload_token` columns, a `purging` status, a `storage_folder` table, and new indexes. `filename` is required; the upgrade fills it from the last key segment.
  - Drizzle setups skip the settings `UPDATE` at the end of each upgrade file. On MySQL, drop the 1.x recommended indexes first, as the file header says.
  - `migrate()` steps one version at a time, so it creates the 2.0.0 indexes. The FumaDB CLI `migrate` command skips them; use `migrate:up` or `migrate()`.
- **Setup.** Remove `fumadb` and the `fumadb/cuid` path alias from your app. `fumadb` is now a pinned dependency of `@dimah-s3/db`, and its adapters are re-exported. Drizzle users must keep every `dimahS3Tables` key, including `private_dimah_s3_settings`. The `drizzle-orm` peer is now `>=1.0.0-rc.5 <2.0.0`: the Drizzle adapter and tables need `drizzle-orm` 1.0.0-rc.5 or later, and 0.44 and 0.45 are no longer supported. Upgrade `drizzle-orm` first.
  - The copy-paste schemas in `src/schema/examples/` are no longer published. Use `@dimah-s3/db/drizzle/<dialect>` (`dimahS3Tables`), `sql/<dialect>.sql`, or `prisma/dimah-s3.prisma`.
- **Options.**
  - `resolveScope` receives `{ request, locals, session, operation, route, key, folder, clientMetadata }`. `operation` gains `"read"` for `GET /db/object`. It runs once per call and target, not once per `Request`, so two `s3.api` calls with the same `Request` but different `locals` resolve separately. `getSession` is still cached per `Request`.
  - An upload on a `replace: "overwrite"` route that replaces an active object runs `authorize` with `object` set to that object, and `folder` is that object's folder, not `clientMetadata.folder`.
  - `authorize` replaces `createObjectAccessGuard`. `quota` accepts a function and replaces `createQuotaGuard`. Both helpers are removed.
  - `pendingTtlMs` is removed: pending rows expire with the upload ticket.
  - Overwrites are set per route with `plugins: { db: { replace: "overwrite" } }`.
  - `plugins: { db: false }` still turns tracking off for a route. Such a route issues unbound tickets and logs a warning at startup when its download or delete has no guard.
  - `TClientAttributes` defaults to the schema output.
- **Behavior.**
  - `s3.put` now tracks rows.
  - Usage ignores expired pending rows. `QUOTA_EXCEEDED` is now 403.
  - An upload to a key that purge is cleaning up returns `CONFLICT`.
- **Store (`s3.db.objects`).** `listByScope` is now `list`, `countByScope` is `count({ ... })`, and `getScopeUsage` is `getUsage`. `findByScopeKey`, `findActive`, `deleteByIds`, the `offset` option, and `s3.db.client` are removed. `deletePending` is replaced by `cancelUpload` and `discardUpload`.
- **Purge.** `purgeStalePendingObjects` is replaced by `s3.db.purgeStale({ limit })` and `s3.db.pruneDeleted({ olderThan })`. A number for `olderThan` is a timestamp in milliseconds, not a duration.
- **HTTP.**
  - `GET /db/objects` drops `offset` and `prefix` (they now return `400`) and adds `folder`, where `""` is the root. `usage`, `limits`, and `folders` come on the first page only, and `nextCursor` is always present. A cursor made under other filters restarts at the first page.
  - `GET /db/objects` returns `400` for `status=purging`. The `status` of `DbClientListInput` and `DbObjectSourceOptions` no longer allows `purging`.
  - Body endpoints accept JSON only.
  - When routes use more than one bucket, `GET` and `PATCH /db/object` require `bucket`.
- **Client (`@dimah-s3/db/client`).**
  - `DbClientObject` gains `folder` (`null` is the root), `updatedAt`, and `attributes`. `updatedAt` is a sort field of its own.
  - `dbObjectQuery` and `dbObjectListAccessors` are replaced by `dbObjectSource(api.db, { route, folders })`, whose `parent` is a folder path. `getFile().updatedAt` is the row's `updatedAt`, and sorting by date uses the same field.
  - `DbObjectListSource`, `DbObjectQueryInput`, `DbObjectQueryOptions`, `DbObjectQueryPage`, `DbObjectListAccessors`, and `DbObjectListAccessorsOptions` are removed. Read a row's file fields with `source.getFile(row)`, and use the `DbObjectSource*` types.
- **Removed exports.** `v1`, `conflict`, `forbidden`, `notFound`, `unauthorized`, `createStorageObjectStore`, `toPendingMultipartResume`, `PendingMultipartResume`, `FindPendingMultipartInput`, `ListByScopeInput`, `ScopeUsage`, `ScopeResolver`, `createObjectAccessGuard`, `createQuotaGuard`, `purgeStalePendingObjects`, and their option types. React's resume record now stores the upload ticket, so the multipart resume helpers are gone. `DbClientGetInput`, `DbClientListInput`, and `DbClientListResponse` are exported from `@dimah-s3/db/client` only.
- **New root exports:** `DB_SCHEMA_VERSION`, `v2`, `DbAttributesOptions`, `DbQuotaOption`, `DbRouteOptions`, `StorageFolder`, `StorageFolderStore`, `DbClientFolder`, `DbQuota`, `DbUsage`, `StandardSchemaV1`, `PurgeStaleOptions`, `PruneDeletedOptions`, and the store input and page types. `runCli` from `@dimah-s3/db/cli` takes a `DimahS3DbClient`.
- **`resolveScope` sees only the caller.** `ScopeContext` is `{ request, locals, session, operation, route? }`; `key`, `folder`, and `clientMetadata` moved to the new `AuthorizeContext` of `authorize`. The scope is resolved once per call, operation, and route.
- **`authorize`** receives the stored row (`StorageObject`, with `scope`, `s3Metadata`, and the stored attributes), not the browser view.
- **New codes.** An upload to a key that holds an active object, without `replace: "overwrite"`, fails with `OBJECT_EXISTS` instead of `CONFLICT`. Creating an existing folder fails with `FOLDER_EXISTS`. `CONFLICT` stays for purge in progress and lost races.
- **Ownership errors.** A row of another scope is `OBJECT_NOT_FOUND` (`404`), not `FORBIDDEN`. An upload to a key another scope holds is still `FORBIDDEN`.
- **`s3.db.objects`** is `DbObjects`: `find`, `list`, `count`, `getUsage`, and `update`, which validates the folder (`FOLDER_INVALID`) and creates it. The lifecycle methods (`upsertPending`, `markActive`, `cancelUpload`, `discardUpload`, `softDelete`, `hardDelete`, `findStale`, `claimStale`, `deletePurged`, `pruneDeleted`) are internal: use `s3.db.pruneDeleted` and the server delete path. `s3.db.folders` (`DbFolders`) validates every path. The `StorageObjectStore`, `StorageFolderStore`, `MarkActiveInput`, and `UpsertPendingInput` exports are replaced by `DbObjects` and `DbFolders`.
- **Folder depth.** A folder path deeper than 32 levels is `FOLDER_INVALID`.
- **HTTP.** `GET /db/objects` no longer returns `scope`: the tenant id stays on the server.
- **Client.** `DbClientRequestInit` is removed: every `api.db` action takes core's `S3RequestOptions`, and per-call `headers` are sent. `DbClientListInput.folder` accepts `null` for the root. `route` is `S3RouteName`, and `DbClientObject.status` is `DbClientObjectStatus` (no `purging`).
- **Purge.** `purgeStale` resolves `PurgeStaleResult` instead of `{ purged }`.

### 2.0.0 beta

`2.0.0-beta` reworks the protocol, the hooks, and the components of every `@dimah-s3/*` package, and moves `db()` to database schema `2.0.0`. This is a beta: later betas can include breaking changes until `2.0.0`. Install the line with the `beta` dist-tag and keep every package on the same beta. The [upgrade guide](https://v2.s3.dimah.dev/docs/migration-2-0) walks through each step, and each package's changelog lists its changes in full.

- **Upload tickets.** Presign and multipart init return a signed ticket, and confirm and every later multipart call send only `{ ticket }`.
- **One error catalog.** Every error is an `APIError` with a catalog `code`, a `status`, and typed `params`.
- **Per-key React state.** Hooks keep state per key, a repeated key joins the running call, and every action returns an outcome.
- **Composable UI.** `Upload*`, `Download*`, and `Delete*` families replace the preset buttons, and toasts come from `UploadToasts`, `DownloadToasts`, and `DeleteToasts`.
- **Folders in `db()`.** Logical folders, typed `attributes`, prebuilt Drizzle tables, and re-exported adapters.

### Breaking changes

- **Set `DIMAH_S3_SECRET`.** Generate it with `openssl rand -base64 32` and use the same value on every instance, or pass `dimahS3({ secret })`. Without it, uploads return `500` outside `development` and `test`.
- **Set `requestChecksumCalculation: "WHEN_REQUIRED"`** on the `S3Client` you pass to `dimahS3()`.
- **Install `@dimah-s3/core`** next to `@dimah-s3/react` and import `APIError`, `S3_ERROR_CODES`, and the protocol helpers from it. Import plain functions such as `uploadFile`, `memoryObjectSource`, and the display formatters `formatFileSize` and `truncateFileName` from `@dimah-s3/react/engine`.
- **React 19.2** is required by `@dimah-s3/react` and `@dimah-s3/ui`, and `@fuma-translate/react` is a peer to install.
- **Replace the preset components** (`UploadButton`, `DownloadButton`, `ProgressDownloadButton`, `DeleteButton`) with the families, and mount one toast component per hook plus one `<Toaster />`.
- **Import schemas from `@dimah-s3/core/schema`.** The root of `@dimah-s3/core` no longer ships Zod, so `uploadBodySchema` and the other schemas moved there.
- **Proxy downloads need `download.mode: "proxy"`.** `/file` refuses routes in presign mode with `404 FEATURE_DISABLED`.
- **Upgrade the `db()` schema** with `sql/upgrade/1.0.0-2.0.0/<dialect>.sql` or `migrate(client)` before you deploy, and remove `fumadb` from your app. With Drizzle, upgrade `drizzle-orm` to 1.0.0-rc.5 or later first.

## @dimah-s3/db@1.7.1

### Slash trimming stays fast

`normalizeObjectKey`, `buildObjectKey`, `buildPublicObjectUrl`, and `normalizeS3ApiBasePath` still remove the same slashes as before. They no longer use a regular expression, so a long run of `/` in a key, public URL, or API base path cannot stall the process.

## @dimah-s3/db@1.7.0

### Delete is idempotent

`api.delete` and `deleteMany` no longer fail with `OBJECT_NOT_FOUND` when the object is not in the bucket, such as an upload that was presigned but never sent, an aborted multipart upload, or an object a lifecycle rule removed. The guards still run, `DeleteObject` is skipped, and `delete.onDeleted` runs with `existed: false`. The response is `{ success: true, existed: false }`, and each `deleteMany` result reports `existed`.

With `db()`, deleting such a key soft- or hard-deletes its `pending` row, so it stops counting toward quota before `purgeStalePendingObjects` runs. A pending multipart upload is aborted by its `uploadId`.

### Open only allowed types in the browser

`download.inlineTypes` lists the MIME types, or `type/*` wildcards, that a route may serve as `inline`. After the guards, presign and `GET /file` read the object's type from HeadObject. A requested `inline` is kept only for a type on the list; anything else is signed as `attachment`. A wildcard never matches HTML, XML (including `image/svg+xml`), or JavaScript, so `image/*` does not open an SVG; list one of those exactly to allow it. An object stored as `application/octet-stream` is typed from its file name, and that type is signed as `ResponseContentType` so it renders.

`GET /routes` returns the list as `download.inlineTypes`. `resolveInlineDisposition` from `@dimah-s3/core` (also re-exported by `@dimah-s3/react`) applies the same rule, so a client can choose Preview or Download from the route instead of keeping a second list. `GET /file` responses now send `X-Content-Type-Options: nosniff`.

### Sizes and counts in the user's locale

`S3Provider` accepts `locale`, such as `"fa"`. The built-in UI then formats sizes, counts, and percentages with that locale's digits: the usage line, upload status, delete confirmation, dropzone hints, and toasts. Unit labels are translation keys (`"MB(file size unit)"` and the rest), so a Persian map can show `۱۲٫۴ مگابایت`. Without `locale`, output is unchanged.

`formatFileSize(bytes, { locale, units })` in `@dimah-s3/core` takes the same options, and `formatSpeed` and `formatUploadProgress` pass them through. `useFormatFileSize()` and `useFormatNumber()` in `@dimah-s3/react` follow the provider for your own components. `dbObjectListAccessors({ formatSize })` takes a formatter for the row description.

### Object list fixes

- `onSelectionChange` fires only when the selected keys or folder ids change. A parent that rebuilds `list.items` or `list.folders` on every render no longer loops into "Maximum update depth exceeded".
- `ObjectList` renders the `upload` hook's file input, so `upload.open()` from a menu item, a split button, or an empty-state button opens the picker. When several inputs share one `useUpload`, such as the list and an `UploadButton` in its header, `open()` uses one that is still mounted.
- In a right-to-left page, a Latin file name starts at the row's start edge, like a Persian one. Names are isolated inline, so the row keeps the page direction. Folder names are no longer split into a stem and an extension. Breadcrumb names, delete confirmations, and toasts isolate only the interpolated name, so `Phase 2 (final)` keeps its parentheses and the sentence keeps its alignment.

### Scope context for `resolveScope`

`db({ resolveScope })` receives a second argument: the `operation` (`"upload"`, `"confirm"`, `"multipart"`, `"download"`, `"delete"`, or `"list"`), the `route`, the object `key` the endpoint already validated, and on upload the client's `clientMetadata`. A scope that depends on the key no longer has to parse the request body or URL. A batch delete resolves once per key. One request calls the resolver once per operation and key, so presign no longer resolves the scope separately for the ownership guard, the quota guard, and `onPresigned`. A one-argument resolver keeps working.

`createObjectAccessGuard` now requires `operation`, which it passes to `resolveScope`. Create one guard per hook, such as `"download"` for `download.guard` and `"delete"` for `delete.guard`.

## @dimah-s3/db@1.6.0

### Page a file catalog from your own query

`useObjectList` loads folders and files from a query you pass in. `ObjectList` renders that state. File checkboxes sit in each row; a folder gets one only when you pass its object keys. After a selection, the header becomes a bar that deletes the loaded page. When another page exists, that checkbox is "Select this page" and the bar says the selection is on this page. `onSelectionChange` reports the checked rows, and `selectionActions` adds your own controls beside Delete. `renderMeta` places your own status beside the file name. `onOpenItem` runs when a file row is clicked. A long name truncates inside the row and keeps a short file extension, the same way attachments do. Hover the name to read it in full. `ObjectListMenu` adds download, delete, and copy link on each row. Pass `onDeleted` to reload after that row is deleted. Copy link signs a URL, copies it, and shows the TTL the server returned. Pass `expiresIn` to ask for a shorter link, and a second `useDownload` with `disposition: "inline"` when that link should open in a browser. A path longer than the root plus two folders collapses the earlier folders into a menu. `dbObjectQuery` adapts `api.db.listObjects` when you use the database plugin, and `dbObjectListAccessors` maps those rows onto the list. A key `prefix` filter now applies inside the list query so pages stay full.

### Choose a shorter share link

Download presign accepts an optional `expiresIn`. The signed TTL is the shorter of that request and the route's `download.expiresIn` (default 10 minutes). `download.resolve` can still choose another TTL, up to `maxExpiresIn`. `GET /routes` reports the cap. `ObjectListMenu` can send that shorter TTL when it copies a link, then shows the TTL the server signed.

### Drop files into the open folder

`ObjectList` accepts a `useUpload` return as `upload`. A drop or paste on the list uploads through that hook into the folder that is open. The list does not open the file picker on click, and it does not choose folder metadata: set `noClick` and `noKeyboard` on the hook, and read `list.parent` in `getUploadOptions`. When the batch settles and at least one file succeeded, the list reloads once, including when other files in the batch failed. Put `UploadButton` in `header` for the picker, with `toast={false}` and `status={false}`, so progress and toasts stay on the list.

### Size the object list frame

`ObjectList` accepts `height` and `maxHeight`. A number is pixels. A string is a CSS length, such as `"18rem"` or `"100%"`. `height` keeps the frame one size. `maxHeight` lets it grow with the folder until that cap. In both cases the header and upload progress stay put, and the rows scroll inside the frame.

### Load the next page from the end of the list

`ObjectList` no longer shows a Load more button. When `list.hasMore` is set, the next page loads as the end of the rows comes into view. A short frame fills itself. Scrolling to the end loads the page after that.

### Object list empty state and row actions

`ObjectList` accepts `empty` when the default empty state is not enough. `emptyTitle` and `emptyDescription` still fill that default. `ObjectListMenu` accepts `actions` for extra rows, such as rename, after Copy link and before Delete.

With focus inside the list, Ctrl+A or Cmd+A selects the same rows as the header checkbox. A selected row sets `data-selected`. Files set `data-kind="file"` and folders set `data-kind="folder"`. Opening another folder after an upload no longer reloads the list a second time.

### Show how full a catalog is

`useObjectList` keeps an optional `usage` from the query: bytes used and file count. A later page can omit it. A refresh or a new folder that omits it clears the value. `dbObjectQuery` forwards the scope `usage` that `listObjects` already returns. `ObjectList` shows that line when `list.usage` is set. Pass `usageLimits` with your own `maxBytes` and `maxFiles` — the same numbers as `db({ quota })` when that plugin enforces the limit — and the line includes the cap and a meter. Without limits, the line is the totals only. Without `usage`, the line stays hidden.

## @dimah-s3/db@1.5.11

### Keep the hook request readable

HTTP handlers clone a JSON body before reading it, so `guard` and `resolveScope` can still call `request.clone().json()`. Direct `s3.api` calls copy `query` onto the request URL and replay a JSON `body`, using that endpoint's method and path. A `request` you pass in is left unchanged.

## @dimah-s3/db@1.5.10

### update deps

## @dimah-s3/db@1.5.9

### Keep `Error.cause` on wrapped client failures

Upload/hook wrappers (`toUploadError`, `toHookError`) now attach the original throw as `error.cause`.

### Compile to ES2025

Workspace TypeScript presets and `dimah-s3 create` starters now target ES2025 (`lib` / `target`). Published package JS is still bundled with tsup `esnext`.

## @dimah-s3/db@1.5.8

### Refresh create starters and AWS SDK

`dimah-s3 create` apps now install AWS SDK 3.1133, Hono 4.13.8, and lucide-react 1.46. Starters compile to ES2024 and enable `noFallthroughCasesInSwitch`, `noImplicitOverride`, and `noUncheckedSideEffectImports`. `@dimah-s3/server` uses the same AWS SDK patch.

### Treat S3UploadError as a real `Error`

Client upload failures (`S3UploadError`) now extend `Error` directly, so they type-check and lint as Promise rejections. They still expose `code`, `status`, and `statusCode`. Detect them with `instanceof S3UploadError` rather than `instanceof APIError`.

## @dimah-s3/db@1.5.7

### Return written rows from pending upsert and confirm

`s3.db.objects.upsertPending()` now returns the written `storage_object` row
via FumaDB `upsert().forceReturning()`. `markActive()` returns the active row
after confirm, including overwrite of an already-active object.

Callers no longer need a follow-up `find` after presign, multipart init, or
confirm. Multipart resume lookup (`findPendingMultipart`) is a single query.

If you implement a custom `StorageObjectStore`, return those records from
`upsertPending` and `markActive` instead of `void`.

## @dimah-s3/db@1.5.6

### Zod 4.6

`@dimah-s3/core`, `@dimah-s3/server`, and `@dimah-s3/db` now depend on Zod 4.6. Compiled request schemas pick up the 4.6 compiler; failed client error bodies use `.validate()` instead of allocating a parse result.

### React 19.3 starters

`@dimah-s3/cli` templates now scaffold React 19.3 (`react`, `react-dom`, and the matching `@types/*` packages).

## @dimah-s3/db@1.5.5

### Expand npm package search keywords

Keywords on `@dimah-s3/server`, `@dimah-s3/react`, `@dimah-s3/ui`, `@dimah-s3/db`, `@dimah-s3/cli`, and `@dimah-s3/core` now include targeted search terms (UploadThing / Better Upload alternative, Cloudflare R2 / MinIO, shadcn uploader, multipart resumable upload, and framework adapters).

## @dimah-s3/db@1.5.4

### Refresh scaffold starter dependencies

`dimah-s3 create` apps now install AWS SDK 3.1126, Base UI 1.8, shadcn 4.21, and matching lucide/cn ranges. `@dimah-s3/server` uses the same AWS SDK patch.

## @dimah-s3/db@1.5.3

### Point docs and registry URLs at s3.dimah.dev

Published homepage fields, the CLI success link, and scaffolded `components.json` registry entries now use https://s3.dimah.dev.

## @dimah-s3/db@1.5.2

### Import `cn` from the `cn` package

`@dimah-s3/ui` now imports class names from [`cn`](https://www.npmjs.com/package/cn), matching shadcn's default. There is no `lib/utils.ts` helper. Install `cn` instead of `cnfast`. Registry items declare `cn` so `shadcn add` installs it.

## @dimah-s3/db@1.5.1

### Align create templates with 1.5.0

`dimah-s3 create` starters now require `@dimah-s3/*` 1.5.0. A fresh scaffold installs the current line, including signed `upload.object` options and catalog status on `useUpload`.

## @dimah-s3/db@1.5.0

### Sign storage class, cache control, and tags from `upload.object`

Return `storageClass`, `cacheControl`, or `tagging` from `upload.object`. They are signed into PUT, POST, multipart init, and `putObject` so the browser cannot change them.

### Surface route catalog failures on `useUpload`

`policy.catalogStatus` and `policy.catalogError` report a failed `GET /routes` instead of failing silently. Uploads still run — the server enforces constraints. Pass `accept` / `maxFileSize` on the hook when the catalog is unavailable.

## @dimah-s3/db@1.4.2

### Tighten upload cleanup and client races

Confirm now deletes the object when HeadObject omits `ContentLength`, matching the existing rollback for constraint and `onConfirmed` failures. A failed multipart `onInit` also runs `onAbort`, so plugins like `db()` can drop the pending row.

Resuming a multipart upload only starts a new session when S3 reports the old `uploadId` is gone (`OBJECT_NOT_FOUND`). Transient `listParts` errors no longer discard a valid session, and 4xx API errors are not retried. Overwrite quota checks subtract the replaced object's size. Shared download and delete hooks ignore stale completions after `reset()` or a newer call.

## @dimah-s3/db@1.4.1

### Clean up failed multipart initialization

Abort multipart uploads when initialization lifecycle hooks fail and cancel retry backoff immediately when an upload is aborted.

## @dimah-s3/db@1.4.0

### Dismiss completed upload, download, and delete status

Completed and failed attachment rows now include a dismiss action that returns the hook to idle, so status no longer stays on screen until a refresh.

## @dimah-s3/db@1.3.0

### Use better-call `APIError`

Protocol errors are `APIError` — the same class name as better-call and
better-auth. `DimahS3Error` and `isDimahS3Error` are removed; detect with
`isAPIError` or `isS3ErrorCode`. Throw `APIError.from(status, S3_ERROR_CODES.*)`
or `errors.*` as before.

## @dimah-s3/db@1.2.1

### Align create templates with 1.2.0

`dimah-s3 create` starters now require `@dimah-s3/*` 1.2.0. Call `useUpload`
in the page and pass the return into `UploadButton` — the control no longer
takes `route`.

## @dimah-s3/db@1.2.0

### Call the hook, pass the return

Upload, download, and delete UI no longer own the route client. Call
`useUpload`, `useDownload`, or `useDelete` in your component, then pass
that return into the control.

### One `useUpload` — `maxFiles` is the switch

`maxFiles` (default `1`) is the only switch between one file and a batch.
The return is always `files[]` (`file` is `files[0]`). Pass the instance
as `upload`.

```tsx
const upload = useUpload({
  route: "images",
  maxFiles: 4,
  onSuccess: (results) => saveKeys(results.map((r) => r.key)),
});

return <UploadDropzone upload={upload} />;
```

The same instance drives `UploadButton`, `UploadStatus`, or a custom
surface (`getRootProps` / `open` / `handleFiles`). Programmatic upload is
`await upload.handleFiles(file)` (`File`, `File[]`, or `FileList`).

Lifecycle callbacks always use arrays: `onSuccess(results)`,
`beforeUpload(files)`, `onUploadStart(files)`, `onCancel()`. Per-file:
`onFileSuccess(file, result)`, `onFileProgress`, `onFileError`.
`onError(error, phase)` no longer receives a `File`.

### Download and delete — hook is the route, button is the object

The control still takes `objectKey` (and display `fileName` / `fileSize`).
The hook is the route client; the button is the object.

```tsx
const download = useDownload({ route: "uploads", mode: "fetch" });
const del = useDelete({
  route: "uploads",
  onSuccess: () => refetch(),
});

return (
  <>
    <ProgressDownloadButton download={download} objectKey={storedKey} />
    <DeleteButton delete={del} objectKey={storedKey} />
  </>
);
```

`DownloadButton` takes a navigate-mode return; `ProgressDownloadButton`
takes `{ mode: "fetch" }`. Narrow with `download.mode` or
`isFetchDownload(download)`. Lifecycle callbacks stay on the hook.

A list can share one download or delete hook: the return includes
`objectKey` for the active operation (kept through success/error until
`reset()`). Status, spinner, dialog, and toasts only apply to the matching
control. Call the hook inside the row when operations must run in
parallel.

```tsx
const download = useDownload({ route: "uploads" });
const del = useDelete({ route: "uploads", onSuccess: refetch });

return files.map((file) => (
  <li key={file.key}>
    <DownloadButton download={download} objectKey={file.key} />
    <DeleteButton delete={del} objectKey={file.key} />
  </li>
));
```

### Compiled Zod 4.5 request validation

Server endpoints compile Zod `body` / `query` schemas with `z.compile()`
on registration. Valid requests take the generated fast path; schemas
that cannot compile (for example `z.coerce`) keep the runtime parser.

Unknown keys on protocol bodies and queries are rejected. Integers use
`z.int()`. Upload `checksum` must be a SHA-256 digest as standard base64
(padding optional). Garbage values return `VALIDATION_ERROR` instead of
being forwarded to S3.

### Removed

- `useMultiUpload`, `useFileUpload`, `useMultiFileUpload`
- `route` / engine options / lifecycle callbacks on `UploadButton`,
  `UploadDropzone`, `DownloadButton`, `ProgressDownloadButton`, and
  `DeleteButton`
- `fileInfo`, `result`, and `totalProgress` on the hook return — use
  `file`, `file.result`, and `progress`
- `useDelete().pendingKey` — use `objectKey` + `isConfirming`
- `useDeleteToast` now requires `objectKey` (same matching rule as the
  button)
- `UploadFileStatus` `fileInfo` / `progress` — pass `file`
- `MultiUploadStatus` unpacked `phase` / `files` / `progress` — pass
  `upload`
- `UseDownloadReturn` is navigate | fetch — narrow with `download.mode`
  or `isFetchDownload(download)`
- `UploadStatusBlock`
- `MultiFileUploadConfig`, `MultiUploadPhase`, `MultiUploadFileState`,
  `MultiUploadHooks`

## @dimah-s3/db@1.1.1

### Align create templates with named routes

`dimah-s3 create` starters now pin `@dimah-s3/*` 1.1.0 and use
`dimahS3({ routes })` with `route()` policies and
`<UploadButton route="uploads" />`.

## @dimah-s3/db@1.1.0

### Named file routes

`dimahS3()` is route-only. Pass a `routes` map of `route()` policies —
empty or missing `routes` throws. The instance holds shared defaults
(`client`, `bucket`, `plugins`, optional `guard`). Each named route
opts in to `upload`, `download`, and `delete`. Multipart is opt-in
under `upload.multipart`. A route may override `client`, `bucket`, or
`keyPrefix`.

The client sends a `route` name on every request. Unknown names return
`UNKNOWN_ROUTE`. Upload and multipart init no longer accept `key` —
the server generates it from `upload.object` (or `{keyPrefix}/{uuid}/{name}`).
Follow-up ops send the stored `key` with the same route.

Hooks and UI require `route`: `useUpload({ route: "uploads" })`,
`<UploadButton route="uploads" />`. Upload hooks no longer take
`objectKey`. Augment `DimahS3Routes` so hook `route` values match
`dimahS3({ routes })`.

### Configure a route

```ts
uploads: route({
  upload: {
    fileTypes: ["image/*"],
    maxFileSize: 10 * 1024 * 1024,
  },
  download: true,
  delete: true,
});
```

- All features default **off**. Set `upload: true` (or an options object)
  to enable presign — omitting `upload` no longer opens an unconstrained
  endpoint.
- Prefer **one feature per named route**. Combine upload / download /
  delete only when those callers share the key namespace. Nested or
  identical `keyPrefix` values across routes are rejected at init.
- `fileTypes`, `maxFileSize`, `acl`, `method`, `expiresIn`, and
  `multipart` live on `upload`. Init and complete reuse `upload.guard` /
  `confirmGuard` / `onConfirmed`. Multipart-only hooks are
  `upload.multipart.onInit`, `.guard` (part / list / abort / complete),
  `.onAbort`, and `.onList`.
- `object({ file, request, clientMetadata })` returns
  `{ folder?, key?, metadata?, acl? }`. Keys nest under route
  `keyPrefix` (default: the route name). Default key is
  `{keyPrefix}/{uuid}/{name}`. Confirm / download / delete / multipart
  follow-ups reject keys outside that prefix. `keyPrefix: false` skips
  the follow-up check and generates `{uuid}/{name}`. Client `metadata`
  is not written to S3 unless `object` copies it.
- `upload.object` maps a plain `Error` to 403, same as `guard`.
- `fileTypes` matches the S3 `Content-Type` header and filename, not
  file bytes. Persist size from `onConfirmed` (`contentLength`), not
  the presign body. Without `db()`, download can presign unconfirmed
  keys under `keyPrefix`; `db()` download requires status `active`.
- Standalone `prefix` / `KeyPrefix` and `resolveKey` are removed.
  Resolved routes keep `fileTypes`, `maxFileSize`, `object`, `acl`,
  `method`, and `expiresIn` on `upload` only.

### Breaking changes

- Upload and multipart init no longer accept `key`. `bucket`, `acl`,
  and `expiresIn` are gone from request payloads.
  `allowClientBucket`, `buckets`, `allowClientAcl`, `requireFileSize`,
  `defaultObjectKey`, and `INVALID_BUCKET` / `errors.invalidBucket`
  are removed. Public React `multipartThreshold` / `partSize` are
  removed.
- Upload JSON bodies are strict: leftover client `key` / `bucket` /
  `acl` / `expiresIn` return `VALIDATION_ERROR`.
- `upload.object` extra directory is `folder`, not `prefix` (that name
  collided with route `keyPrefix`).
- `upload.multipart.sessionGuard` is now `upload.multipart.guard`.
  Complete runs that hook (`action: "complete"`) then `confirmGuard`.
- ACL on confirm comes from the upload policy — `resolveObjectAcl` is
  gone.
- `getFileExtension` and `mapStorageObjectRow` are no longer public.
- Disabled features are a discriminated `{ enabled: false }` — hook
  fields exist only when the feature is on. `OpenedRoute<"upload">`
  types `route.upload` as enabled.
- Plugin `init` runs after routes validate, so an empty `routes` map
  throws the route error instead of a plugin message. Read user
  toggles with `isFeatureOn` (it understands resolved
  `{ enabled: false }` objects).

### Keys, TTL, and constraints

- Generated keys take the filename leaf only (`../secret.png` →
  `…/{uuid}/secret.png`) so a crafted name cannot fail `INVALID_KEY`
  or nest extra folders. Stored keys are validated on the wire (no
  `..` segments, S3 part numbers 1–10000, strict query objects).
- Multipart `signPart` requires `partSize` (locked into
  `Content-Length`). When `maxFileSize` is set, signPart lists
  uploaded parts and rejects a part that would exceed the cap.
  Complete sums listed part sizes and aborts the MPU before assembly
  if over. Duplicate complete part numbers are ignored.
  `fileSize` / `partSize` must be integers.
- POST presign rejects bodies over S3's 5 GiB POST limit.
- File constraints are checked at presign, on each multipart part,
  and again after HeadObject (`FILE_TYPE_NOT_ALLOWED`,
  `PAYLOAD_TOO_LARGE`). `FILE_TYPE_NOT_ALLOWED` params are `fileName`
  and optional `contentType`. Blank `contentType` is omitted (browser
  `file.type` is often `""`); the server still defaults to
  `application/octet-stream`.
- TTL is `upload.expiresIn` for upload and multipart part URLs, and
  `download.expiresIn` for download. Each falls back to the protocol
  default (600s) independently. Both are clamped by instance
  `maxExpiresIn`.

### Confirm, catalog, and extras

`GET /routes` (`api.catalog()`) publishes each route's upload
constraints and which features are on. Upload hooks fill `accept` /
`maxFileSize` / checksum from that catalog when you omit them.

Confirm and multipart complete now `DeleteObject` if HeadObject checks
or `onConfirmed` throw, then delete `previousKey` after a successful
replace.

Download can return an inline disposition, a same-origin `GET /file`
proxy, or per-request `download.resolve` values. `deleteMany` deletes
up to 100 keys. Server-side uploads that should still run route policy
use `s3.put`.

`chainHooks` exports from `@dimah-s3/server`. `S3UploadError` and
`fileNameFromKey` are public.

### Database plugin

The `db()` plugin stores a `route` column, lists with cursor /
filters, and exposes `getObject`. Optional `quota` and purge can
abort/delete on S3.

Confirm pending rows only, bind abort / part / complete to the
pending `uploadId`, and list `active` objects by default. Soft-deleted
keys no longer block another scope from reusing that key.

`purgeStalePendingObjects` and `createObjectAccessGuard` take
`client` (same name as `db({ client })`).

### React and UI

- `useObjectUrl` and `@dimah-s3/react/engine` are public.
  Engine options are `FileUploadConfig` / `MultiFileUploadConfig` so
  they do not collide with server `UploadConfig`.
- `useUpload` returns `result`. Multi-file state includes `result`
  per file. `UploadResult` includes verified `contentLength`.
- `useDelete` gains `remove(key)` for a one-shot delete without the
  confirm step. UI download/delete keep the prop name `objectKey`
  because React reserves `key`.
- Upload retry no longer re-presigns after bytes have landed. Cancel
  aborts the in-flight run instead of marking a cancelled batch as
  success. A second `upload()` / `download()` / `confirmDelete()` no
  longer races the previous request. `useFileUpload().reset()` no
  longer fires `onCancel`. Cancel during `beforeUpload` now aborts
  instead of continuing the upload.

### Naming

- `ResolvedRoute` is the normalized named route (was
  `ResolvedRoutePolicy`).
- `RouteFeature` is `upload` | `download` | `delete`. `RouteOperation`
  adds `multipart` (nested under upload). These replace `FeatureName` /
  `FeatureFlag`.
- Guard contexts match the hook names: `UploadGuardContext`,
  `DownloadGuardContext`, `DeleteGuardContext`. `upload.object` uses
  `UploadObjectContext` / `UploadObjectInfo`. Confirm / download /
  delete / multipart session hooks share `StoredObjectContext` once a
  key is assigned.
- `upload.guard` / `onPresigned` / multipart `onInit` expose the
  declared file as `file: { name, size?, type? }` — the same shape as
  `object`. Multipart part URLs use `url` (same as every other
  presign response). Download's response type is
  `DownloadPresignResponse`.

## @dimah-s3/db@1.0.2

### Document `prefix` factories

`prefix` on upload, download, delete, and multipart already accepted an async
factory with `ResolveKeyContext` — the same context as `resolveKey`. Docs,
JSDoc, and the public `@dimah-s3/server` export now make that path obvious.
Use a factory for per-user or per-tenant folders so confirm and download of a
stored key stay idempotent. `resolveKey` still replaces the entire key.

## @dimah-s3/db@1.0.1

### cli templates deps update

## @dimah-s3/db@1.0.0

### Freeze the 1.0 APIs

Server, React, and UI contracts are now the v1 surface. Uploads stay private
unless you set `upload.acl` or `upload.allowClientAcl`. `allowClientBucket`
and `buckets` cannot be combined. Presign lifetime is clamped with
`maxExpiresIn` (7 days by default).

### Server

- Confirm, abort, and multipart list/complete map missing S3 objects or
  uploads to `OBJECT_NOT_FOUND` instead of a generic 500.
- PUT presigns include object metadata (and the `x-amz-meta-*` headers the
  client must send). `requireFileSize` applies to POST as well as PUT, and
  multipart inherits it from upload when omitted.
- Unsigned POST uploads without `fileSize` are capped at 5 GB (the S3 POST
  object limit).
- Multipart complete pages `ListParts` and rejects a missing part with
  `MULTIPART_PART_MISSING`. Abort responses include `bucket`, `key`, and
  `uploadId`.
- `errors.payloadTooLarge()` is in the catalog (`PAYLOAD_TOO_LARGE`, HTTP 413)
  for quota hooks. Prefer `errors.*` over constructing `DimahS3Error` with a
  catalog code as the first argument.
- Plugin hooks can no longer type `prefix` / `resolveKey` — key policy stays
  on your `dimahS3()` config. The `db()` plugin uses `pluginPath` and
  ownership guards on multipart part/list/complete/abort.
- `db()` 404s use `OBJECT_NOT_FOUND`. Confirm/complete will not resurrect a
  soft-deleted row. `GET /db/objects` defaults to 50 items and maxes out at 100.
- `@dimah-s3/server` no longer exports `resolveObjectAcl` from the package
  root, or `coreEndpoints` from `@dimah-s3/server/api`. Use the
  `resolveObjectAcl` config flag; plugin authors keep `createS3Endpoint` and
  `CORE_ENDPOINT_NAMES`.
- Feature flags: `true` or an options object turns a feature on; omit or
  `false` turns it off. There is no `enabled` field on the options object.

### React and UI

The headless hooks keep the same product shape (`useUpload` /
`useMultiUpload` / `useFileUpload` / `useMultiFileUpload`), with a smaller
public surface.

- `useFileUpload` now exposes `fileInfo` instead of separate `fileName` /
  `fileSize` / `fileType` / `previewUrl` fields. Multi-file rows use the same
  `name` / `size` / `type` shape.
- `isPending` is true for the whole in-flight window. `isUploading` still
  means bytes are transferring. Wired UI disables intake on `isPending`.
- `useMultiUpload` `objectKey` is a function of the file only.
- `maxFiles` and `concurrentFiles` live on multi-file config only.
  `uploadOptions` / `getUploadOptions` are on `useFileUpload` as well as
  multi.
- Internal helpers (`useFileIntake`, speed/preview factories, error mappers)
  are no longer exported from `@dimah-s3/react`. Dropzone types stay on
  `useUpload`.
- Upload status covers `finalizing`. Multi-file status can pause. Download
  button accepts `bucket`, lifecycle hooks, and an optional tooltip.
- Dropzone `accept` is the HTML list (`image/*`, `application/pdf`, `.pdf`).
  The native file input gets that string. Type checks go through
  `validateFile` (dropzone `validator` at intake, and again on programmatic
  `upload()`). There is no MIME-map helper and no IANA table.

## @dimah-s3/db@0.8.6

### deps update

## @dimah-s3/db@0.8.5

### Clarify npm discovery copy

Package keywords now include S3-compatible storage terms so the packages
show up for more than a single vendor.

## @dimah-s3/db@0.8.4

### Install registry items from UI source

Namespaced (`@dimah-s3/…`) and GitHub (`dimah-kz/dimah-s3/…`) installs now copy `packages/ui/src` as-is. Import aliases stay `@/` until the shadcn CLI rewrites them for the consuming app.

## @dimah-s3/db@0.8.3

### Fix shadcn registry installs

Installing `@dimah-s3/*` UI items no longer rewrites layout helpers onto the stock Attachment primitive. Upload items ship the reject-toast hook, `@fuma-translate/react` and `react-file-icon` types install automatically, and dimah color tokens are injected into the project CSS.

## @dimah-s3/db@0.8.2

### Fix invalid dropzone `accept` mapping

Bare extensions such as `.pdf` now pair with their IANA media type so the file picker no longer warns that a catch-all MIME type is invalid. Hook `accept` still uses HTML unique file type specifiers (`image/*`, `application/pdf`, `.pdf`). The dropzone conversion helper is no longer a public export.

### Allow in-memory upload transports

Custom `S3Api` objects may set `uploadTransport` to move file bytes without PUT/POST to the presigned URL. Use this for in-memory backends and demos that must not send large files through a serverless function.

## @dimah-s3/db@0.8.1

### Refresh official starters to the current setup

`create` now scaffolds the same file layout as Quickstart / Server / Client / UI
setup (`lib/s3.ts`, `lib/s3-client.ts`, route adapter, `S3Provider` + `Toaster`)
and pins starter `@dimah-s3/*` ranges to the current line, along with updated
Next.js, Hono, and shadcn versions.

## @dimah-s3/db@0.8.0

### Align the consumer API and switch to better-call

Server config uses `client` (`awsS3`) and `bucket` (the default bucket;
client-sent `bucket` is ignored unless `allowClientBucket` or `buckets`).
Enable a feature with `true` or an options object
(`upload: { prefix: "uploads" }`). Multipart is on whenever
upload is, unless you set `multipart: false`. `upload.guard` /
`download.guard` replace `presignGuard`. Disabled features return
`FEATURE_DISABLED` (still HTTP 404). Use `prefix` or `resolveKey` to
own object keys.

`createS3Client()` from `@dimah-s3/react` _is_ the API
(`s3Client.download(key)`), plus `Provider` and `useApi`. Cross-origin apps
pass `baseURL`. `objectKey` is optional. `useDownload({ mode: "fetch" })`
replaces `useFetchDownload`. Hook `error` is a `DimahS3Error`.

Server routes and plugins now use `createS3Endpoint` (better-call) with Zod
schemas. Call `s3.api.download({ query: { key }, headers })` instead of
`s3.api.download(key, { headers })`. Plugin paths are absolute under
`basePath` (`/db/objects`). Client plugins use `getActions($fetch)` and
`pluginPath`. The Next.js adapter also exports `PUT` and `PATCH`.

`DimahS3Error` extends better-call `APIError` with the same
`(status, body)` constructor. HTTP error JSON is `{ message, code?, params? }`.
Detect errors with `isAPIError` / `isDimahS3Error`. The browser client maps
non-OK responses onto `DimahS3Error` and exposes `$ERROR_CODES`.

Plugin-author helpers live on `@dimah-s3/server/plugins`. Starters export
`awsS3` and `s3` from `lib/s3.ts`, plus `lib/s3-client.ts`. See the
[changelog](https://dimah-s3.vercel.app/docs/changelog).

## @dimah-s3/db@0.7.4

### Return the pending row from `upsertPending`

`s3.db.objects.upsertPending()` now returns the written `storage_object` row.
FumaDB 0.6 can return that row from the upsert itself (`forceReturning()`), so
callers no longer need a follow-up `find` after presign or multipart init.

If you implement a custom `StorageObjectStore`, return the pending record from
`upsertPending` instead of `void`.

## @dimah-s3/db@0.7.3

### Align npm discovery metadata

Package keywords, descriptions, and homepage URLs now match how people
search for presigned S3 / R2 uploads. READMEs point coding agents at
llms.txt.

## @dimah-s3/db@0.7.2

### deps update

## @dimah-s3/db@0.7.1

### Fix attachment title shimmer in dark mode

In dark mode, uploading/processing titles use
`dark:shimmer-color-dimah-s3-muted-foreground` so the highlight stays visible on
near-white text. Light mode keeps the stock shimmer formula.

## @dimah-s3/db@0.7.0

### Attachment-based upload status UI

Upload, download, and delete feedback now share Attachment-based status rows
(`FileAttachment` / `StatusAttachment`). Wired components take a single
`status` prop (`true` | `false` | render function) instead of `showStatus` /
`renderStatus`. Dropzone `children` only replace idle chrome.

Dimah-owned UI lives under `components/dimah-s3/` (attachment pieces under
`components/dimah-s3/attachment/`), separate from stock shadcn
`components/ui/` (internal only — not exported from `@dimah-s3/ui`). Shared
helpers stay in `lib/` (`attachment.ts`, `status-slot`). For custom chrome,
add Attachment in your app with `npx shadcn@latest add attachment`.

### Attachment size, orientation, and layout types

`FileAttachment`, `StatusAttachment`, `UploadStatus`, `MultiUploadStatus`, and
`UploadStatusBlock` accept stock Attachment `size` (`default` | `sm` | `xs`)
and `orientation` (`horizontal` | `vertical`). Defaults remain `sm` /
`horizontal`. Wired buttons and dropzones expose `attachmentSize` /
`attachmentOrientation` so they do not clash with Button `size`.

Exported layout types: `AttachmentSize`, `AttachmentOrientation`,
`AttachmentLayoutProps`, `AttachmentLayoutAliases`, and `AttachmentState`.
Removed aliases: `FileAttachmentState`, `StatusAttachmentState`.

### Image thumbnails and file-type icons

Upload state includes MIME type and a managed image `previewUrl` on
`UploadFileInfo` / `MultiUploadFileState`. `FileAttachment` renders
`AttachmentMedia variant="image"` with a progress overlay while uploading,
then the thumbnail when complete. Non-image files use colored
`react-file-icon` glyphs from a curated extension map (aliases and MIME
families cover the rest).

### Rename upload hooks

| Role                            | New                                    | Previous                                       |
| ------------------------------- | -------------------------------------- | ---------------------------------------------- |
| File intake (dropzone / picker) | `useUpload` / `useMultiUpload`         | `useUploadControls` / `useMultiUploadControls` |
| Engine (`upload(file)`)         | `useFileUpload` / `useMultiFileUpload` | `useUpload` / `useMultiUpload`                 |

Matching option and return types follow the same names
(`UseFileUploadOptions`, `UseMultiFileUploadReturn`, …).

### react-dropzone intake API

`useUpload` and `useMultiUpload` are built on react-dropzone. Replace
`inputProps`, `dropHandlers`, and `openFilePicker` with:

- `getRootProps()` / `getInputProps()`
- `open()`
- `isDragActive` / `isDragAccept` / `isDragReject`
- `fileRejections` (soft rejects at intake)

`UploadDropzone` and `UploadButton` already use this API. Dropzones highlight
accept vs reject drag states and toast soft rejections. Each control mounts
only the single- or multi-file hook it needs.

### Zustand-backed hook state

Engine hooks (`useFileUpload`, `useMultiFileUpload`, `useDownload`,
`useFetchDownload`, `useDelete`) keep phase and progress in per-instance
Zustand stores with Immer. Public return shapes are unchanged; store
subscriptions use shallow equality to cut redundant re-renders.

### Prefixed UI color tokens

`@dimah-s3/ui` styles dimah-owned chrome (progress, dropzone accents,
overlays) with `--color-dimah-s3-*` tokens. Importing
`@dimah-s3/ui/styles.css` maps them to your shadcn variables by default
(`--primary`, `--muted`, …). Override `--color-dimah-s3-*` to theme the
library independently. The bridge is also available as
`@dimah-s3/ui/css/shadcn.css`.

## @dimah-s3/db@0.6.3

### Clarify create success message

After scaffolding, the CLI still names the project in the success line, with "Your app" as the fallback when the name is missing.

## @dimah-s3/db@0.6.2

### scipts update and remove changelog from templates

## @dimah-s3/db@0.6.1

### Maintenance patch

No public API changes. Keeps the published `@dimah-s3/*` line aligned with the current monorepo release tooling.

## @dimah-s3/db@0.6.0

### Add Vite and Hono CLI starters

`create` now offers `vite` (React SPA + Hono API) and `hono` (Hono + Vite React) alongside the default Next.js template. Pick a framework interactively or pass `--template vite` / `--template hono`.

### Scaffold Next.js starters under `src/`

Official Next.js templates and examples now keep app code in `src/`. `create` prompts for a `src/` directory (default yes) and accepts `--src` / `--no-src`.

## @dimah-s3/db@0.5.0

### Add `@dimah-s3/cli`

Scaffold official starters with `npx @dimah-s3/cli@latest create my-app`. Templates are bundled into the CLI at publish time.

## @dimah-s3/db@0.4.1

### Fix upload toast progress updates

Upload progress toasts now update in place instead of re-adding on each progress tick, so the loading toast stays stable during uploads.

## @dimah-s3/db@0.4.0

### Add framework adapters for popular servers

Mount `dimahS3().handler` with first-class adapters for Express, Hono, Fastify, Elysia, and SvelteKit (alongside Next.js and Node). Each ships as a subpath export such as `@dimah-s3/server/hono` with no framework peer dependency.

## @dimah-s3/db@0.3.2

### update domain to https://dimah-s3.vercel.app

## @dimah-s3/db@0.3.1

### update deps

## @dimah-s3/db@0.3.0

### Drizzle ORM 1.x peer support

`@dimah-s3/db` now accepts `drizzle-orm` `>=1.0.0-rc.1` alongside `0.44` / `0.45`. Requires FumaDB 0.5+ for the Drizzle adapter.

## @dimah-s3/db@0.2.0

### Use shadcn Base UI toast instead of Sonner

Upload, download, and delete feedback now uses the shadcn Base UI toast.

- **npm:** mount `<Toaster />` from `@dimah-s3/ui` in your root layout.
- **Registry:** install shadcn `toast` and mount `<Toaster />` from `@/components/ui/toast`.

## @dimah-s3/db@0.1.3

### docs update

## @dimah-s3/db@0.1.2

### Verify OIDC publish for all packages

Confirm GitHub Actions trusted publishing works for the full `@dimah-s3/*` line, including `@dimah-s3/db`.

## @dimah-s3/db@0.1.1

### Verify npm trusted publishing (OIDC)

Test patch to confirm GitHub Actions can publish via trusted publishers without `NPM_TOKEN`.

## @dimah-s3/db@0.1.0

### Initial release

First public release of the Dimah S3 presigned upload, download, and delete toolkit (`@dimah-s3/core`, `server`, `react`, `ui`, `db`).
