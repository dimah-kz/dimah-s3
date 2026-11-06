---
packages:
  "@dimah-s3/react": major
---

### Upload limits across calls

`useUploadLimit` caps the files one `useUpload` takes in across its calls, and `retry` takes several ids at once.

- **`useUploadLimit(upload, { available, counted })`** caps every call of the hook while the calling component is mounted: `handleFiles`, `open`, drops, pastes, and `retry`, wherever they come from. A call holds its slots from the moment it starts, so two quick calls never take the same ones. The hook rejects the files past the limit with `TOO_MANY_FILES`, and a retry sends only the failed files that fit. It returns the files that still fit, counting calls still preparing. The `UploadLimit` type names its argument.
- **`retry(ids)`** takes one id or several. Failed files that came from one call go again as one call, so `beforeUpload`, `onUploadStart`, and `onSettled` run once for them.

#### Breaking changes

- **Accept an array in a `retry` stub.** `UseUploadReturn["retry"]` now takes `string | readonly string[]`, so a test stub that implements `retry(id?: string)` must take `ids?: string | readonly string[]`.
