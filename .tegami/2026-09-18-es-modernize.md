---
packages:
  group:dimah-s3: patch
---

### Keep `Error.cause` on wrapped client failures

Upload/hook wrappers (`toUploadError`, `toHookError`) now attach the original throw as `error.cause`.
