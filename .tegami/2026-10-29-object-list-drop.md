---
packages:
  group:dimah-s3: minor
---

### Drop files into the open folder

`ObjectList` accepts a `useUpload` return as `upload`. A drop or paste on the list uploads through that hook into the folder that is open. The list does not open the file picker on click, and it does not choose folder metadata: set `noClick` and `noKeyboard` on the hook, and read `list.parent` in `getUploadOptions`. When the batch settles and at least one file succeeded, the list reloads once, including when other files in the batch failed. Put `UploadButton` in `header` for the picker, with `toast={false}` and `status={false}`, so progress and toasts stay on the list.
