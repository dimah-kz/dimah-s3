---
packages:
  "@dimah-s3/server":
    replay:
      - exit-prerelease(npm:@dimah-s3/server)
---

### Confirm checks for plugins

`@dimah-s3/server/plugins` exports the checks confirm already uses.

- **`readObjectMetadata`.** Reads HeadObject user metadata, without the upload marker or the previous key.
- **`assertFileConstraints`.** Applies a route's `fileTypes` and `maxFileSize`, and rejects an empty file.
