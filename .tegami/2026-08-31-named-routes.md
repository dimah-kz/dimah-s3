---
packages:
  group:dimah-s3: minor
---

## Named file routes

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
