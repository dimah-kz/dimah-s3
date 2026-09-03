## @dimah-s3/react@1.4.2

### Tighten upload cleanup and client races

Confirm now deletes the object when HeadObject omits `ContentLength`, matching the existing rollback for constraint and `onConfirmed` failures. A failed multipart `onInit` also runs `onAbort`, so plugins like `db()` can drop the pending row.

Resuming a multipart upload only starts a new session when S3 reports the old `uploadId` is gone (`OBJECT_NOT_FOUND`). Transient `listParts` errors no longer discard a valid session, and 4xx API errors are not retried. Overwrite quota checks subtract the replaced object's size. Shared download and delete hooks ignore stale completions after `reset()` or a newer call.

## @dimah-s3/react@1.4.1

### Clean up failed multipart initialization

Abort multipart uploads when initialization lifecycle hooks fail and cancel retry backoff immediately when an upload is aborted.

## @dimah-s3/react@1.4.0

### Dismiss completed upload, download, and delete status

Completed and failed attachment rows now include a dismiss action that returns the hook to idle, so status no longer stays on screen until a refresh.

## @dimah-s3/react@1.3.0

### Use better-call `APIError`

Protocol errors are `APIError` — the same class name as better-call and
better-auth. `DimahS3Error` and `isDimahS3Error` are removed; detect with
`isAPIError` or `isS3ErrorCode`. Throw `APIError.from(status, S3_ERROR_CODES.*)`
or `errors.*` as before.

## @dimah-s3/react@1.2.1

### Align create templates with 1.2.0

`dimah-s3 create` starters now require `@dimah-s3/*` 1.2.0. Call `useUpload`
in the page and pass the return into `UploadButton` — the control no longer
takes `route`.

## @dimah-s3/react@1.2.0

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

## @dimah-s3/react@1.1.1

### Align create templates with named routes

`dimah-s3 create` starters now pin `@dimah-s3/*` 1.1.0 and use
`dimahS3({ routes })` with `route()` policies and
`<UploadButton route="uploads" />`.

## @dimah-s3/react@1.1.0

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

## @dimah-s3/react@1.0.2

### Document `prefix` factories

`prefix` on upload, download, delete, and multipart already accepted an async
factory with `ResolveKeyContext` — the same context as `resolveKey`. Docs,
JSDoc, and the public `@dimah-s3/server` export now make that path obvious.
Use a factory for per-user or per-tenant folders so confirm and download of a
stored key stay idempotent. `resolveKey` still replaces the entire key.

## @dimah-s3/react@1.0.1

### cli templates deps update

## @dimah-s3/react@1.0.0

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

## @dimah-s3/react@0.8.6

### deps update

## @dimah-s3/react@0.8.5

### Clarify npm discovery copy

Package keywords now include S3-compatible storage terms so the packages
show up for more than a single vendor.

## @dimah-s3/react@0.8.4

### Install registry items from UI source

Namespaced (`@dimah-s3/…`) and GitHub (`dimah-kz/dimah-s3/…`) installs now copy `packages/ui/src` as-is. Import aliases stay `@/` until the shadcn CLI rewrites them for the consuming app.

## @dimah-s3/react@0.8.3

### Fix shadcn registry installs

Installing `@dimah-s3/*` UI items no longer rewrites layout helpers onto the stock Attachment primitive. Upload items ship the reject-toast hook, `@fuma-translate/react` and `react-file-icon` types install automatically, and dimah color tokens are injected into the project CSS.

## @dimah-s3/react@0.8.2

### Fix invalid dropzone `accept` mapping

Bare extensions such as `.pdf` now pair with their IANA media type so the file picker no longer warns that a catch-all MIME type is invalid. Hook `accept` still uses HTML unique file type specifiers (`image/*`, `application/pdf`, `.pdf`). The dropzone conversion helper is no longer a public export.

### Allow in-memory upload transports

Custom `S3Api` objects may set `uploadTransport` to move file bytes without PUT/POST to the presigned URL. Use this for in-memory backends and demos that must not send large files through a serverless function.

## @dimah-s3/react@0.8.1

### Refresh official starters to the current setup

`create` now scaffolds the same file layout as Quickstart / Server / Client / UI
setup (`lib/s3.ts`, `lib/s3-client.ts`, route adapter, `S3Provider` + `Toaster`)
and pins starter `@dimah-s3/*` ranges to the current line, along with updated
Next.js, Hono, and shadcn versions.

## @dimah-s3/react@0.8.0

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

## @dimah-s3/react@0.7.4

### Return the pending row from `upsertPending`

`s3.db.objects.upsertPending()` now returns the written `storage_object` row.
FumaDB 0.6 can return that row from the upsert itself (`forceReturning()`), so
callers no longer need a follow-up `find` after presign or multipart init.

If you implement a custom `StorageObjectStore`, return the pending record from
`upsertPending` instead of `void`.

## @dimah-s3/react@0.7.3

### Align npm discovery metadata

Package keywords, descriptions, and homepage URLs now match how people
search for presigned S3 / R2 uploads. READMEs point coding agents at
llms.txt.

## @dimah-s3/react@0.7.2

### deps update

## @dimah-s3/react@0.7.1

### Fix attachment title shimmer in dark mode

In dark mode, uploading/processing titles use
`dark:shimmer-color-dimah-s3-muted-foreground` so the highlight stays visible on
near-white text. Light mode keeps the stock shimmer formula.

## @dimah-s3/react@0.7.0

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

## @dimah-s3/react@0.6.3

### Clarify create success message

After scaffolding, the CLI still names the project in the success line, with "Your app" as the fallback when the name is missing.

## @dimah-s3/react@0.6.2

### scipts update and remove changelog from templates

## @dimah-s3/react@0.6.1

### Maintenance patch

No public API changes. Keeps the published `@dimah-s3/*` line aligned with the current monorepo release tooling.

## @dimah-s3/react@0.6.0

### Add Vite and Hono CLI starters

`create` now offers `vite` (React SPA + Hono API) and `hono` (Hono + Vite React) alongside the default Next.js template. Pick a framework interactively or pass `--template vite` / `--template hono`.

### Scaffold Next.js starters under `src/`

Official Next.js templates and examples now keep app code in `src/`. `create` prompts for a `src/` directory (default yes) and accepts `--src` / `--no-src`.

## @dimah-s3/react@0.5.0

### Add `@dimah-s3/cli`

Scaffold official starters with `npx @dimah-s3/cli@latest create my-app`. Templates are bundled into the CLI at publish time.

## @dimah-s3/react@0.4.1

### Fix upload toast progress updates

Upload progress toasts now update in place instead of re-adding on each progress tick, so the loading toast stays stable during uploads.

## @dimah-s3/react@0.4.0

### Add framework adapters for popular servers

Mount `dimahS3().handler` with first-class adapters for Express, Hono, Fastify, Elysia, and SvelteKit (alongside Next.js and Node). Each ships as a subpath export such as `@dimah-s3/server/hono` with no framework peer dependency.

## @dimah-s3/react@0.3.2

### update domain to https://dimah-s3.vercel.app

## @dimah-s3/react@0.3.1

### update deps

## @dimah-s3/react@0.3.0

### Drizzle ORM 1.x peer support

`@dimah-s3/db` now accepts `drizzle-orm` `>=1.0.0-rc.1` alongside `0.44` / `0.45`. Requires FumaDB 0.5+ for the Drizzle adapter.

## @dimah-s3/react@0.2.0

### Use shadcn Base UI toast instead of Sonner

Upload, download, and delete feedback now uses the shadcn Base UI toast.

- **npm:** mount `<Toaster />` from `@dimah-s3/ui` in your root layout.
- **Registry:** install shadcn `toast` and mount `<Toaster />` from `@/components/ui/toast`.

## @dimah-s3/react@0.1.3

### docs update

## @dimah-s3/react@0.1.2

### Verify OIDC publish for all packages

Confirm GitHub Actions trusted publishing works for the full `@dimah-s3/*` line, including `@dimah-s3/db`.

## @dimah-s3/react@0.1.1

### Verify npm trusted publishing (OIDC)

Test patch to confirm GitHub Actions can publish via trusted publishers without `NPM_TOKEN`.

## @dimah-s3/react@0.1.0

### Initial release

First public release of the Dimah S3 presigned upload, download, and delete toolkit (`@dimah-s3/core`, `server`, `react`, `ui`, `db`).
