---
packages:
  group:dimah-s3: minor
---

### Upload status UI around shadcn Attachment

Upload, download, and delete feedback share Attachment-based status rows
(`FileAttachment` / `StatusAttachment`). Wired components use a single `status`
prop (`true` | `false` | render function) instead of `showStatus` /
`renderStatus`. Dropzone `children` only replace idle chrome.

Dimah-owned components live under `components/dimah-s3` (separate from stock
shadcn `components/ui`). Hooks stay in `hooks/`; helpers like `status-slot`
stay in `lib/`.

### Image thumbnails and file icons

Upload hooks expose MIME type and a managed image `previewUrl` on
`UploadFileInfo` / `MultiUploadFileState`. `FileAttachment` shows
`AttachmentMedia variant="image"` with a progress overlay while uploading,
then the thumbnail when complete. Non-image files use colored
`react-file-icon` glyphs from a curated extension map (aliases + MIME family
cover the rest).

### Zustand hook state and react-dropzone controls

Client hooks (`useUpload`, `useMultiUpload`, `useDownload`, `useFetchDownload`,
`useDelete`) keep phase/progress in per-instance Zustand stores with Immer.
Public return shapes for these hooks are unchanged.

`useUploadControls` and `useMultiUploadControls` now use react-dropzone.
Replace `inputProps`, `dropHandlers`, and `openFilePicker` with:

- `getRootProps()` / `getInputProps()`
- `open()`
- `isDragActive` / `isDragAccept` / `isDragReject`
- `fileRejections` (soft rejects at intake)

`UploadDropzone` and `UploadButton` already use the new API. Dropzone
highlights accept vs reject drag states and toasts soft file rejections.
Each button/dropzone calls only the single- or multi-file controls hook it
needs. Upload hooks subscribe to store slices with shallow equality for fewer
redundant re-renders.
