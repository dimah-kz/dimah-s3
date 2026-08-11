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
shadcn `components/ui`). Attachment UI is under
`components/dimah-s3/attachment/`. Hooks stay in `hooks/`; helpers like
`status-slot` and `lib/attachment.ts` stay in `lib/`.

### Attachment size and orientation

`FileAttachment`, `StatusAttachment`, `UploadStatus`, `MultiUploadStatus`, and
`UploadStatusBlock` accept stock Attachment `size` (`default` | `sm` | `xs`)
and `orientation` (`horizontal` | `vertical`). Defaults stay `sm` /
`horizontal`. Wired buttons and dropzones use `attachmentSize` /
`attachmentOrientation` so they do not clash with Button `size`.

Shared layout types from `@dimah-s3/ui`: `AttachmentSize`,
`AttachmentOrientation`, `AttachmentLayoutProps`, `AttachmentLayoutAliases`.
Use `AttachmentState` instead of the removed `FileAttachmentState` /
`StatusAttachmentState` aliases.

### Image thumbnails and file icons

Upload hooks expose MIME type and a managed image `previewUrl` on
`UploadFileInfo` / `MultiUploadFileState`. `FileAttachment` shows
`AttachmentMedia variant="image"` with a progress overlay while uploading,
then the thumbnail when complete. Non-image files use colored
`react-file-icon` glyphs from a curated extension map (aliases + MIME family
cover the rest).

### Rename upload hooks

Primary intake hooks are now `useUpload` / `useMultiUpload` (formerly
`useUploadControls` / `useMultiUploadControls`), matching `useDownload` and
`useDelete`.

Engine hooks (call `upload()` with a `File` you already have) are
`useFileUpload` / `useMultiFileUpload`. Matching types renamed
(`UseFileUploadOptions`, `UseMultiFileUploadReturn`, …).

### Zustand hook state and react-dropzone intake

Engine hooks (`useFileUpload`, `useMultiFileUpload`, `useDownload`,
`useFetchDownload`, `useDelete`) keep phase/progress in per-instance Zustand
stores with Immer. Public return shapes for these hooks are unchanged.

`useUpload` and `useMultiUpload` use react-dropzone for file intake.
Replace `inputProps`, `dropHandlers`, and `openFilePicker` with:

- `getRootProps()` / `getInputProps()`
- `open()`
- `isDragActive` / `isDragAccept` / `isDragReject`
- `fileRejections` (soft rejects at intake)

`UploadDropzone` and `UploadButton` already use the new API. Dropzone
highlights accept vs reject drag states and toasts soft file rejections.
Each button/dropzone calls only the single- or multi-file upload hook it
needs. Upload hooks subscribe to store slices with shallow equality for fewer
redundant re-renders.
