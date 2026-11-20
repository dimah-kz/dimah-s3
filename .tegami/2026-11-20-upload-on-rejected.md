---
packages:
  "@dimah-s3/server": major
---

### A hook for rejected uploads, and one vocabulary in hook contexts

A refused upload now reports back, and the upload hooks name things the way the rest of the API does.

- **`upload.onRejected`.** Runs after confirm, multipart complete, or `s3.put` refuses an upload and deletes its object: a size, type, or content mismatch, a `confirmGuard` rejection, or a plugin that rejects it. The context has the key, `kind`, `uploadToken`, the declared `file`, and the `error` the client receives. Undo there what `onStart` recorded. A throw is logged and passed to `onError`, and the client still gets the rejection. A plugin adds it under `hooks.upload.onRejected`.
- **`PUT` plugin endpoints.** `createS3Endpoint` accepts `method: "PUT"`, which reads a JSON body like `POST` and `PATCH`.
- **An empty `secret` counts as not set.** `dimahS3({ secret: process.env.MY_SECRET })` falls back to `DIMAH_S3_SECRET` while the variable is missing or empty, so the option needs no `|| undefined`.

#### Breaking changes

- **Upload kinds.** `kind` is `"presignedPost"`, `"presignedPut"`, `"multipart"`, or `"server"`: `"post"` is `"presignedPost"` and `"put"` is `"presignedPut"`. `operation: "put"` is still `s3.put`, whose kind is `"server"`.
- **`upload.multipart.guard` narrows on `operation`.** The context has no `action`. Compare `operation` with `"multipart.signPart"`, `"multipart.listParts"`, `"multipart.complete"`, or `"multipart.abort"`. `partNumber` and `size` are on the `"multipart.signPart"` context.
- **`clientMetadata` on `s3.api`.** `s3.api.upload` and `s3.api.multipart.init` take `clientMetadata`, as `s3.put` and the hooks do. `metadata` is rejected with `VALIDATION_ERROR`.
- **`UNKNOWN_ROUTE` is `ROUTE_NOT_FOUND`.**
- **`secret: []` falls back to `DIMAH_S3_SECRET`** instead of throwing when `dimahS3()` runs.
