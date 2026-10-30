---
packages:
  group:dimah-s3: patch
---

### Object list fixes

- `onSelectionChange` fires only when the selected keys or folder ids change. A parent that rebuilds `list.items` or `list.folders` on every render no longer loops into "Maximum update depth exceeded".
- `ObjectList` renders the `upload` hook's file input, so `upload.open()` from a menu item, a split button, or an empty-state button opens the picker. When several inputs share one `useUpload`, such as the list and an `UploadButton` in its header, `open()` uses one that is still mounted.
- In a right-to-left page, a Latin file name starts at the row's start edge, like a Persian one. Names are isolated inline, so the row keeps the page direction. Folder names are no longer split into a stem and an extension. Breadcrumb names, delete confirmations, and toasts isolate only the interpolated name, so `Phase 2 (final)` keeps its parentheses and the sentence keeps its alignment.
