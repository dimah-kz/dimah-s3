## @dimah-s3/cli@0.7.1

### Fix attachment title shimmer in dark mode

In dark mode, uploading/processing titles use
`dark:shimmer-color-dimah-s3-muted-foreground` so the highlight stays visible on
near-white text. Light mode keeps the stock shimmer formula.

## @dimah-s3/cli@0.7.0

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

## @dimah-s3/cli@0.6.3

### Clarify create success message

After scaffolding, the CLI still names the project in the success line, with "Your app" as the fallback when the name is missing.

## @dimah-s3/cli@0.6.2

### scipts update and remove changelog from templates

## @dimah-s3/cli@0.6.1

### Maintenance patch

No public API changes. Keeps the published `@dimah-s3/*` line aligned with the current monorepo release tooling.

## @dimah-s3/cli@0.6.0

### Add Vite and Hono CLI starters

`create` now offers `vite` (React SPA + Hono API) and `hono` (Hono + Vite React) alongside the default Next.js template. Pick a framework interactively or pass `--template vite` / `--template hono`.

### Scaffold Next.js starters under `src/`

Official Next.js templates and examples now keep app code in `src/`. `create` prompts for a `src/` directory (default yes) and accepts `--src` / `--no-src`.

## @dimah-s3/cli@0.5.0

### Add `@dimah-s3/cli`

Scaffold official starters with `npx @dimah-s3/cli@latest create my-app`. Templates are bundled into the CLI at publish time.
