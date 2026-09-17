---
packages:
  group:dimah-s3: patch
---

### Treat S3UploadError as a real `Error`

Client upload failures (`S3UploadError`) now extend `Error` directly, so they type-check and lint as Promise rejections. They still expose `code`, `status`, and `statusCode`. Detect them with `instanceof S3UploadError` rather than `instanceof APIError`.
