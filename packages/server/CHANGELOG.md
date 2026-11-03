## @dimah-s3/server@2.0.0-beta.1 (beta)

### Fix proxy downloads that never finish

`GET /file` through the Node adapter now writes the object body directly. A download larger than the stream buffer no longer stalls until the client gives up.

## @dimah-s3/server@2.0.0-beta.0 (beta)

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

### Signed upload tickets, a hardened `/file`, and one error boundary

Presign and multipart init return an HMAC-signed upload ticket. Confirm and every later multipart call verify it, so a client can only finish the upload the server started. Set `ticketSubject` (or use `db()`) to bind a ticket to the caller, so a leaked ticket is useless to anyone else.

- **Multipart.** The server picks the part layout from the declared size, signs each part with its exact length, and with `checksum` on, checks a SHA-256 for every part. `complete` lists the parts itself and is safe to retry.
- **`upload.verifyContent`** reads the first bytes after confirm and rejects a file whose bytes do not match its declared type with `FILE_CONTENT_MISMATCH`. An upload without a type is checked against the type its name gives (`x.png` as `image/png`). It turns on `checksum`, so the bytes cannot change after the check.
- **Safer confirm.** A rejected confirm deletes the object with `If-Match` on the HeadObject ETag, so a newer upload at the same key is kept (a provider without conditional delete gets a plain delete). Confirm and multipart complete report, and pass to `onConfirmed` and `db()`, the ACL that `upload.object()` chose, not the route default. A retried or concurrent multipart complete that gets `NoSuchUpload` finalizes the object.
- **Presigned POST** pins the object key with an `eq` condition. A key from `upload.object()` that contains `${filename}` returns `KEY_INVALID`, and a generated key turns `${` in the file name into `_{`.
- **Empty files.** Presign, multipart init, and `s3.put` reject a zero-byte file with `FILE_EMPTY`.
- **`deleteMany`** gives each key its own `locals`.
- **`upload.onStart({ kind, uploadToken, uploadId?, url?, urlExpiresAt?, expiresAt })`** runs for presign, multipart init, and `s3.put`. `kind` is `"post"`, `"put"`, `"multipart"`, or `"server"`.
- **`/file`** sends `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy`, and `Cache-Control: private, no-cache`. It supports a single `Range`, `ETag`, and `If-None-Match`, `If-Modified-Since`, `If-Match`, `If-Unmodified-Since`, and `If-Range`.
- **Guards** can return `{ locals }` to pass values to later hooks in the same call. Augment `DimahS3Locals` to type them.
- **`s3.api`** has the same shape as the browser client and takes `{ headers, request, locals }` as a second argument. `locals` lets trusted server code skip a session lookup.
- **`s3.put`** accepts a `Blob`, a `ReadableStream`, bytes, or a string, writes `Content-Disposition`, and runs the same hooks as a browser upload.
- **Node adapters** (`toNodeHandler`, `toExpressHandler`, `toFastifyHandler`) stream request bodies and abort the S3 call when the client disconnects. Pass `{ trustProxy: true }` to honor `X-Forwarded-*`.
- **New config:** `secret`, `ticketSubject`, `baseURL`, `maxRequestBodySize` (1 MiB by default, counted on the stream for every request with a body), `upload.confirmWindow`, `upload.verifyContent`, `upload.multipart.partSize`, and `upload.multipart.ticketExpiresIn`.
- **Plugin endpoints** built with `createS3Endpoint` accept `GET`, `POST`, `PATCH`, and `DELETE`. `chainHooks` chains guards that return `{ locals }`.

- **`confirmGuard` sees the verified object.** Its context gains `object` (from HeadObject) and `acl`, so the guard whose rejection deletes the object can check what was really stored. `onConfirmed` gains the declared `file` and the `previousKey` it is about to delete.
- **Plugin helpers.** `@dimah-s3/server/plugins` exports `readUploadMarker`, `deleteObjectIfMatch`, and `isAwsNotFound`, so a plugin that tracks uploads can remove an object only while it is still the one an upload wrote.
- **Multipart abort is idempotent,** like delete: an upload that is already gone succeeds and runs `onAbort`. One that was completed fails with `CONFLICT`. The response gains `bucket`.
- **`onError`** may be async, and its context gains `operation`. A rejection from it is logged instead of crashing the process.
- **`s3.api` and `s3.put`** take a `signal`, like the browser options.
- **`/file`** forwards `Content-Encoding` and `Content-Language`, so a gzip object decodes in the browser.
- **Express** mounts work: `app.use("/api/s3", toExpressHandler(s3))` reads `req.originalUrl`.
- **Fixes.** A plugin `onConfirmed` that fails for a non-4xx reason, such as a database outage, keeps the uploaded object for the retry instead of deleting it. Confirm reports the `kind` the URL was signed with, carried in the ticket, not the route's current `upload.method`. `NoSuchBucket` is a logged `500`, not `404 OBJECT_NOT_FOUND`. More socket errors are `S3_NETWORK_ERROR`. A backslash in a file name becomes `_` in the generated key. An error from another library that is merely named `APIError` is reported as an unexpected failure, not passed to the client.

### Breaking changes

- **A secret is required for uploads.** Set `DIMAH_S3_SECRET` (`openssl rand -base64 32`, at least 32 characters) or pass `dimahS3({ secret })`. Use the same value on every instance, and pass an array to rotate: the first value signs, all of them verify. Without a secret, uploads return `500` unless `NODE_ENV` is `development` or `test`.
- **`S3Client` checksums.** A client you pass must set `requestChecksumCalculation: "WHEN_REQUIRED"`. The SDK default breaks presigned uploads, so the first presign logs the problem and returns `500`.
- **Upload hooks.**
  - `upload.onPresigned` and `multipart.onInit` are replaced by `upload.onStart`. `multipart.onList` is removed.
  - Upload contexts use `file: { name, size, type }`. `onConfirmed` gets the verified `object: { name, size, type, eTag, versionId, lastModified, metadata }` plus `uploadToken`.
  - `onConfirmed` runs at least once per upload. Dedupe on `uploadToken`. Any throw from your `onConfirmed`, including an `APIError`, returns `500` and keeps the object. Reject content in `confirmGuard` instead; a rejection there deletes the object.
  - Confirm and complete delete the object only on a 4xx rejection. A network error keeps it so the call can be retried.
- **Hook contexts.** Every context has `operation` and `locals`. `StoredObjectContext` is now `ObjectContext`. Download contexts gain `mode`, `download.onPresigned` gets `disposition`, and proxy downloads have no `expiresIn`. `delete.onDeleted` has no `existed`. In `upload.object`, `folder` is now `keyFolder`.
- **Guards** return nothing or `{ locals }`. Any other value, such as `true` or `false`, is a config error: it is logged and the call returns `500`. `ticketSubject` sees locals from the instance and route guards only.
- **Hook order.** Lifecycle `on*` hooks run plugin hooks first, then yours, the same as guards.
- **Errors.** A plain `Error` thrown from a hook returns `500 INTERNAL_ERROR` and is logged. Throw `s3Error("FORBIDDEN")` or another catalog code to reject. The `errors` export is removed. `onError` is called as `onError(error, { request })`.
- **Security defaults.**
  - Downloads open inline only for raster images, PDF (presign mode only), audio, video, and plain text, unless `download.inlineTypes` is set.
  - Body endpoints, core and plugin, accept `application/json` only and return `415 UNSUPPORTED_MEDIA_TYPE` otherwise.
  - A presigned PUT signs every header it returns. Custom transports must send `headers` exactly.
  - Non-ASCII metadata values are RFC 2047-encoded and decoded on read. User metadata is limited to 2 KB in total.
- **Route numbers.** `upload.expiresIn`, `upload.confirmWindow`, `upload.maxFileSize`, `upload.multipart.partSize`, `upload.multipart.ticketExpiresIn`, and `download.maxExpiresIn` must be positive integers. A fractional value now throws at `dimahS3()`.
- **Config.** `upload.replace` is now `plugins: { db: { replace: "overwrite" } }` on the route. `download.expiresIn` is now `download.maxExpiresIn`. `upload.method` now defaults to `"PUT"`, which every provider supports, including R2; set `method: "POST"` to keep presigned POST.
- **`s3.api`** takes the browser payload plus `{ headers, request, locals }`. The aliases `deleteBatch`, `multipart*`, and `file` are removed. Plugin endpoints are HTTP only and no longer appear on `s3.api`.
- **`s3.put`** takes `{ route, name, type, body, size?, metadata, clientMetadata }`. `fileName` and `contentType` are now `name` and `type`, and `headers` moved to the second argument.
- **`/file` URLs** are relative to the API base path unless `baseURL` is set.
- **Removed exports.**
  - From `@dimah-s3/server`: `putObject`, `PutObjectInput`, `errors`, `ServerErrors`, `MultipartAliasApi`, `ROUTE_FEATURES`, `ROUTE_OPERATIONS`, and the `Resolved*`, `Opened*`, `Enabled*`, and `Disabled*` types.
  - `ObjectFile` is removed; use `UploadFile` for upload contexts and `VerifiedObject` for the confirmed object. `RouteFeature` and `RouteOperation` are removed; hook contexts carry `operation: S3Operation`.
  - `UploadOnPresignedContext`, `MultipartOnInitContext`, and `MultipartOnListContext` are replaced by `UploadOnStartContext`.
  - `definePlugin`, `createS3Endpoint`, `createS3Middleware`, and `isFeatureOn` are exported from `@dimah-s3/server/plugins` only. `chainHooks` stays in the main entry.
  - `DimahS3Plugin`, `DimahS3PluginHooks`, `PluginContextMap`, `PluginInitEnv`, and `S3EndpointContext` are exported from `@dimah-s3/server/plugins` only.
  - `@dimah-s3/server/plugins` no longer re-exports the config and hook-context types (`DimahS3Config`, `DimahS3RouteConfig`, `UploadConfig`, `DownloadConfig`, `DeleteConfig`, `MultipartConfig`, `FeatureToggle`, `GuardContext`, `RouteGuardContext`, `UploadObjectInfo`, and the `Upload*`, `Download*`, `Delete*`, and `Multipart*` contexts) or `chainHooks`. Import them from `@dimah-s3/server`.
  - From `@dimah-s3/server/plugins`: `applyPlugins`, `AppliedPlugins`, `CoreEndpoints`, `ReservedPluginId`, the `*_HOOK_KEYS` arrays, `RESERVED_PLUGIN_IDS`, and `CORE_ENDPOINT_NAMES`.
  - The `@dimah-s3/server/api` entry is gone.
- **Plugins.** `DimahS3Plugin` has no endpoint type parameter, and `PluginEndpointMap` is removed. Plugins may provide `hooks.ticketSubject`. Reserved plugin ids are now only the instance keys: `handler`, `api`, `put`, `context`, `getPlugin`, `$ERROR_CODES`, and `$Infer`. The pathless `createS3Endpoint(options, handler)` overload is removed.
- **`/file` serves proxy-mode routes only.** A route with `download.mode: "presign"` (the default) returns `404 FEATURE_DISABLED` with `feature: "proxy"` there, so the server never streams objects a route did not opt in for.
- **Plugin `onConfirmed` failures.** Only a rejection (a `4xx` `APIError`) deletes the object. Any other throw keeps it and returns `500`, so the client can retry.
- **Plugin `init`** must be synchronous. Returning a promise throws at `dimahS3()`.
- **`download.resolve`** must return `expiresIn` as a positive integer. Anything else is a config error (`500`), not a silent `600`. In proxy mode the resolve and guard contexts have no `expiresIn` key at all.
- **Upload checks run first.** Presign checks the single-upload cap and a required checksum before `upload.object()` runs, and every upload kind runs `upload.guard` with the final metadata (`s3.put` merges its `metadata` first).
- **`keyPrefix` overlap** is checked per bucket: routes on different buckets may share a prefix. A `keyPrefix: false` route on a bucket that other routes use logs a warning.
- **`createS3Endpoint`** throws right away for a core path.
- **Hook contexts.** `UploadConfirmGuardContext` gains the required `acl` and `object`, and `UploadOnConfirmedContext` the required `file`: code that builds them by hand, such as tests, must add them.

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

## @dimah-s3/server@1.7.1

### Slash trimming stays fast

`normalizeObjectKey`, `buildObjectKey`, `buildPublicObjectUrl`, and `normalizeS3ApiBasePath` still remove the same slashes as before. They no longer use a regular expression, so a long run of `/` in a key, public URL, or API base path cannot stall the process.

## @dimah-s3/server@1.7.0

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

## @dimah-s3/server@1.6.0

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

## @dimah-s3/server@1.5.11

### Keep the hook request readable

HTTP handlers clone a JSON body before reading it, so `guard` and `resolveScope` can still call `request.clone().json()`. Direct `s3.api` calls copy `query` onto the request URL and replay a JSON `body`, using that endpoint's method and path. A `request` you pass in is left unchanged.

## @dimah-s3/server@1.5.10

### update deps

## @dimah-s3/server@1.5.9

### Keep `Error.cause` on wrapped client failures

Upload/hook wrappers (`toUploadError`, `toHookError`) now attach the original throw as `error.cause`.

### Compile to ES2025

Workspace TypeScript presets and `dimah-s3 create` starters now target ES2025 (`lib` / `target`). Published package JS is still bundled with tsup `esnext`.

## @dimah-s3/server@1.5.8

### Refresh create starters and AWS SDK

`dimah-s3 create` apps now install AWS SDK 3.1133, Hono 4.13.8, and lucide-react 1.46. Starters compile to ES2024 and enable `noFallthroughCasesInSwitch`, `noImplicitOverride`, and `noUncheckedSideEffectImports`. `@dimah-s3/server` uses the same AWS SDK patch.

### Treat S3UploadError as a real `Error`

Client upload failures (`S3UploadError`) now extend `Error` directly, so they type-check and lint as Promise rejections. They still expose `code`, `status`, and `statusCode`. Detect them with `instanceof S3UploadError` rather than `instanceof APIError`.

## @dimah-s3/server@1.5.7

### Return written rows from pending upsert and confirm

`s3.db.objects.upsertPending()` now returns the written `storage_object` row
via FumaDB `upsert().forceReturning()`. `markActive()` returns the active row
after confirm, including overwrite of an already-active object.

Callers no longer need a follow-up `find` after presign, multipart init, or
confirm. Multipart resume lookup (`findPendingMultipart`) is a single query.

If you implement a custom `StorageObjectStore`, return those records from
`upsertPending` and `markActive` instead of `void`.

## @dimah-s3/server@1.5.6

### Zod 4.6

`@dimah-s3/core`, `@dimah-s3/server`, and `@dimah-s3/db` now depend on Zod 4.6. Compiled request schemas pick up the 4.6 compiler; failed client error bodies use `.validate()` instead of allocating a parse result.

### React 19.3 starters

`@dimah-s3/cli` templates now scaffold React 19.3 (`react`, `react-dom`, and the matching `@types/*` packages).

## @dimah-s3/server@1.5.5

### Expand npm package search keywords

Keywords on `@dimah-s3/server`, `@dimah-s3/react`, `@dimah-s3/ui`, `@dimah-s3/db`, `@dimah-s3/cli`, and `@dimah-s3/core` now include targeted search terms (UploadThing / Better Upload alternative, Cloudflare R2 / MinIO, shadcn uploader, multipart resumable upload, and framework adapters).

## @dimah-s3/server@1.5.4

### Refresh scaffold starter dependencies

`dimah-s3 create` apps now install AWS SDK 3.1126, Base UI 1.8, shadcn 4.21, and matching lucide/cn ranges. `@dimah-s3/server` uses the same AWS SDK patch.

## @dimah-s3/server@1.5.3

### Point docs and registry URLs at s3.dimah.dev

Published homepage fields, the CLI success link, and scaffolded `components.json` registry entries now use https://s3.dimah.dev.

## @dimah-s3/server@1.5.2

### Import `cn` from the `cn` package

`@dimah-s3/ui` now imports class names from [`cn`](https://www.npmjs.com/package/cn), matching shadcn's default. There is no `lib/utils.ts` helper. Install `cn` instead of `cnfast`. Registry items declare `cn` so `shadcn add` installs it.

## @dimah-s3/server@1.5.1

### Align create templates with 1.5.0

`dimah-s3 create` starters now require `@dimah-s3/*` 1.5.0. A fresh scaffold installs the current line, including signed `upload.object` options and catalog status on `useUpload`.

## @dimah-s3/server@1.5.0

### Sign storage class, cache control, and tags from `upload.object`

Return `storageClass`, `cacheControl`, or `tagging` from `upload.object`. They are signed into PUT, POST, multipart init, and `putObject` so the browser cannot change them.

### Surface route catalog failures on `useUpload`

`policy.catalogStatus` and `policy.catalogError` report a failed `GET /routes` instead of failing silently. Uploads still run — the server enforces constraints. Pass `accept` / `maxFileSize` on the hook when the catalog is unavailable.

## @dimah-s3/server@1.4.2

### Tighten upload cleanup and client races

Confirm now deletes the object when HeadObject omits `ContentLength`, matching the existing rollback for constraint and `onConfirmed` failures. A failed multipart `onInit` also runs `onAbort`, so plugins like `db()` can drop the pending row.

Resuming a multipart upload only starts a new session when S3 reports the old `uploadId` is gone (`OBJECT_NOT_FOUND`). Transient `listParts` errors no longer discard a valid session, and 4xx API errors are not retried. Overwrite quota checks subtract the replaced object's size. Shared download and delete hooks ignore stale completions after `reset()` or a newer call.

## @dimah-s3/server@1.4.1

### Clean up failed multipart initialization

Abort multipart uploads when initialization lifecycle hooks fail and cancel retry backoff immediately when an upload is aborted.

## @dimah-s3/server@1.4.0

### Dismiss completed upload, download, and delete status

Completed and failed attachment rows now include a dismiss action that returns the hook to idle, so status no longer stays on screen until a refresh.

## @dimah-s3/server@1.3.0

### Use better-call `APIError`

Protocol errors are `APIError` — the same class name as better-call and
better-auth. `DimahS3Error` and `isDimahS3Error` are removed; detect with
`isAPIError` or `isS3ErrorCode`. Throw `APIError.from(status, S3_ERROR_CODES.*)`
or `errors.*` as before.

## @dimah-s3/server@1.2.1

### Align create templates with 1.2.0

`dimah-s3 create` starters now require `@dimah-s3/*` 1.2.0. Call `useUpload`
in the page and pass the return into `UploadButton` — the control no longer
takes `route`.

## @dimah-s3/server@1.2.0

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

## @dimah-s3/server@1.1.1

### Align create templates with named routes

`dimah-s3 create` starters now pin `@dimah-s3/*` 1.1.0 and use
`dimahS3({ routes })` with `route()` policies and
`<UploadButton route="uploads" />`.

## @dimah-s3/server@1.1.0

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

## @dimah-s3/server@1.0.2

### Document `prefix` factories

`prefix` on upload, download, delete, and multipart already accepted an async
factory with `ResolveKeyContext` — the same context as `resolveKey`. Docs,
JSDoc, and the public `@dimah-s3/server` export now make that path obvious.
Use a factory for per-user or per-tenant folders so confirm and download of a
stored key stay idempotent. `resolveKey` still replaces the entire key.

## @dimah-s3/server@1.0.1

### cli templates deps update

## @dimah-s3/server@1.0.0

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

## @dimah-s3/server@0.8.6

### deps update

## @dimah-s3/server@0.8.5

### Clarify npm discovery copy

Package keywords now include S3-compatible storage terms so the packages
show up for more than a single vendor.

## @dimah-s3/server@0.8.4

### Install registry items from UI source

Namespaced (`@dimah-s3/…`) and GitHub (`dimah-kz/dimah-s3/…`) installs now copy `packages/ui/src` as-is. Import aliases stay `@/` until the shadcn CLI rewrites them for the consuming app.

## @dimah-s3/server@0.8.3

### Fix shadcn registry installs

Installing `@dimah-s3/*` UI items no longer rewrites layout helpers onto the stock Attachment primitive. Upload items ship the reject-toast hook, `@fuma-translate/react` and `react-file-icon` types install automatically, and dimah color tokens are injected into the project CSS.

## @dimah-s3/server@0.8.2

### Fix invalid dropzone `accept` mapping

Bare extensions such as `.pdf` now pair with their IANA media type so the file picker no longer warns that a catch-all MIME type is invalid. Hook `accept` still uses HTML unique file type specifiers (`image/*`, `application/pdf`, `.pdf`). The dropzone conversion helper is no longer a public export.

### Allow in-memory upload transports

Custom `S3Api` objects may set `uploadTransport` to move file bytes without PUT/POST to the presigned URL. Use this for in-memory backends and demos that must not send large files through a serverless function.

## @dimah-s3/server@0.8.1

### Refresh official starters to the current setup

`create` now scaffolds the same file layout as Quickstart / Server / Client / UI
setup (`lib/s3.ts`, `lib/s3-client.ts`, route adapter, `S3Provider` + `Toaster`)
and pins starter `@dimah-s3/*` ranges to the current line, along with updated
Next.js, Hono, and shadcn versions.

## @dimah-s3/server@0.8.0

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

## @dimah-s3/server@0.7.4

### Return the pending row from `upsertPending`

`s3.db.objects.upsertPending()` now returns the written `storage_object` row.
FumaDB 0.6 can return that row from the upsert itself (`forceReturning()`), so
callers no longer need a follow-up `find` after presign or multipart init.

If you implement a custom `StorageObjectStore`, return the pending record from
`upsertPending` instead of `void`.

## @dimah-s3/server@0.7.3

### Align npm discovery metadata

Package keywords, descriptions, and homepage URLs now match how people
search for presigned S3 / R2 uploads. READMEs point coding agents at
llms.txt.

## @dimah-s3/server@0.7.2

### deps update

## @dimah-s3/server@0.7.1

### Fix attachment title shimmer in dark mode

In dark mode, uploading/processing titles use
`dark:shimmer-color-dimah-s3-muted-foreground` so the highlight stays visible on
near-white text. Light mode keeps the stock shimmer formula.

## @dimah-s3/server@0.7.0

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

## @dimah-s3/server@0.6.3

### Clarify create success message

After scaffolding, the CLI still names the project in the success line, with "Your app" as the fallback when the name is missing.

## @dimah-s3/server@0.6.2

### scipts update and remove changelog from templates

## @dimah-s3/server@0.6.1

### Maintenance patch

No public API changes. Keeps the published `@dimah-s3/*` line aligned with the current monorepo release tooling.

## @dimah-s3/server@0.6.0

### Add Vite and Hono CLI starters

`create` now offers `vite` (React SPA + Hono API) and `hono` (Hono + Vite React) alongside the default Next.js template. Pick a framework interactively or pass `--template vite` / `--template hono`.

### Scaffold Next.js starters under `src/`

Official Next.js templates and examples now keep app code in `src/`. `create` prompts for a `src/` directory (default yes) and accepts `--src` / `--no-src`.

## @dimah-s3/server@0.5.0

### Add `@dimah-s3/cli`

Scaffold official starters with `npx @dimah-s3/cli@latest create my-app`. Templates are bundled into the CLI at publish time.

## @dimah-s3/server@0.4.1

### Fix upload toast progress updates

Upload progress toasts now update in place instead of re-adding on each progress tick, so the loading toast stays stable during uploads.

## @dimah-s3/server@0.4.0

### Add framework adapters for popular servers

Mount `dimahS3().handler` with first-class adapters for Express, Hono, Fastify, Elysia, and SvelteKit (alongside Next.js and Node). Each ships as a subpath export such as `@dimah-s3/server/hono` with no framework peer dependency.

## @dimah-s3/server@0.3.2

### update domain to https://dimah-s3.vercel.app

## @dimah-s3/server@0.3.1

### update deps

## @dimah-s3/server@0.3.0

### Drizzle ORM 1.x peer support

`@dimah-s3/db` now accepts `drizzle-orm` `>=1.0.0-rc.1` alongside `0.44` / `0.45`. Requires FumaDB 0.5+ for the Drizzle adapter.

## @dimah-s3/server@0.2.0

### Use shadcn Base UI toast instead of Sonner

Upload, download, and delete feedback now uses the shadcn Base UI toast.

- **npm:** mount `<Toaster />` from `@dimah-s3/ui` in your root layout.
- **Registry:** install shadcn `toast` and mount `<Toaster />` from `@/components/ui/toast`.

## @dimah-s3/server@0.1.3

### docs update

## @dimah-s3/server@0.1.2

### Verify OIDC publish for all packages

Confirm GitHub Actions trusted publishing works for the full `@dimah-s3/*` line, including `@dimah-s3/db`.

## @dimah-s3/server@0.1.1

### Verify npm trusted publishing (OIDC)

Test patch to confirm GitHub Actions can publish via trusted publishers without `NPM_TOKEN`.

## @dimah-s3/server@0.1.0

### Initial release

First public release of the Dimah S3 presigned upload, download, and delete toolkit (`@dimah-s3/core`, `server`, `react`, `ui`, `db`).
