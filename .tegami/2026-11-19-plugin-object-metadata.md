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
- **`operation: "record"`.** Guards can see it. `s3.db.record` is not an HTTP route.

#### Breaking changes

- **Handle `operation: "record"`.** A switch on `S3Operation` needs a `record` case. Only `s3.db.record` sends it.
