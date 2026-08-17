---
packages:
  group:dimah-s3: patch
---

### Map API error `code` and `params` on the client

Non-OK JSON from the dimah-s3 API now populates `DimahS3Error.code` and
`params` on `createS3Client` (so client i18n can key off the stable code).
