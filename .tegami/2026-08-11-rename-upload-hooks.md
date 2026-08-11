---
packages:
  group:dimah-s3: minor
---

### Rename upload hooks

Primary intake hooks are now `useUpload` / `useMultiUpload` (formerly
`useUploadControls` / `useMultiUploadControls`), matching `useDownload` and
`useDelete`.

The previous engine hooks (call `upload()` with a `File` you already have)
are `useFileUpload` / `useMultiFileUpload`. Matching types renamed
(`UseFileUploadOptions`, `UseMultiFileUploadReturn`, …).
