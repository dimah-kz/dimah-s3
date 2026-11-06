---
packages:
  "@dimah-s3/ui": minor
---

### UploadField holds its limit on every call

`UploadField` enforces `maxFiles` through the hook, so code outside the field no longer pushes it past its limit.

- **Every entry point.** The Retry action of an `UploadToasts`, `usePasteFiles(upload)`, and your own `upload.open()` or `upload.handleFiles()` take only the files that still fit, like the field's own parts. The field sets a `useUploadLimit` on the hook while it is mounted.
- **Calls still preparing count.** Two quick picks or drops never take the same room, and `useUploadFieldContext().remaining` counts the files of calls still preparing, so the field shows as full from the moment its last room is taken.
- **One retry call.** A retry in the field sends the failed files that fit as one call, so `beforeUpload`, `onUploadStart`, and `onSettled` run once.
- **Full fields.** The retry actions of `UploadStatus` and `UploadFileList` stay focusable but are `aria-disabled`. A call through the field's `upload` is rejected with `TOO_MANY_FILES` instead of ignored.
- **`FileAttachment` `retryDisabled`** shows the retry action as unavailable: focusable, `aria-disabled`, and inert.
