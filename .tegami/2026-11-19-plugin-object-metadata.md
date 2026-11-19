---
packages:
  "@dimah-s3/server": patch
---

### Decoded object metadata for plugins

`readObjectMetadata` from `@dimah-s3/server/plugins` reads HeadObject user metadata the way confirm does, without the upload marker or the previous key.
