---
packages:
  group:dimah-s3: patch
---

### Dropzone reject feedback and leaner upload UI

`UploadDropzone` now highlights accept vs reject drag states and toasts soft
file rejections from react-dropzone. `UploadButton` / `UploadDropzone` call
only the single- or multi-file controls hook they need (no dual-hook waste).
Upload hooks subscribe to store slices with shallow equality for fewer
redundant re-renders.
