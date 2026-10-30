---
packages:
  group:dimah-s3: patch
---

### Slash trimming stays fast

`normalizeObjectKey`, `buildObjectKey`, `buildPublicObjectUrl`, and `normalizeS3ApiBasePath` still remove the same slashes as before. They no longer use a regular expression, so a long run of `/` in a key, public URL, or API base path cannot stall the process.
