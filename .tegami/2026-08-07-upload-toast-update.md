---
packages:
  group:dimah-s3: patch
---

### Fix upload toast progress updates

Upload progress toasts now update in place instead of re-adding on each progress tick, so the loading toast stays stable during uploads.
