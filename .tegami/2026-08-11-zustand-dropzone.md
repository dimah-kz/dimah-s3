---
packages:
  group:dimah-s3: major
---

### Zustand + Immer for hook state

Client hooks (`useUpload`, `useMultiUpload`, `useDownload`, `useFetchDownload`,
`useDelete`) now keep phase/progress state in per-instance Zustand stores with
Immer. Public return shapes for these hooks are unchanged.

### react-dropzone controls API

`useUploadControls` and `useMultiUploadControls` now use react-dropzone.

**Breaking:** replace `inputProps`, `dropHandlers`, and `openFilePicker` with:

- `getRootProps()` / `getInputProps()`
- `open()`
- `isDragActive` / `isDragAccept` / `isDragReject`
- `fileRejections` (soft rejects at intake)

UI components (`UploadDropzone`, `UploadButton`) already use the new API.
