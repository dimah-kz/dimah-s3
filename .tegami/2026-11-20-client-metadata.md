---
packages:
  "@dimah-s3/core":
    replay:
      - exit-prerelease(npm:@dimah-s3/core)
---

### One name for client metadata

The upload body, the client option, and the server hooks all call the client's extras `clientMetadata`, so `metadata` always means the object's S3 user metadata.

- **`QUOTA_EXCEEDED` names a third cap.** Its `limit` param can be `"folders"`, next to `"bytes"` and `"files"`, for the folder cap of `db()`.

#### Breaking changes

- **Send `clientMetadata`, not `metadata`.** The upload and multipart init bodies (`UploadPayload`, `MultipartInitPayload`, `uploadBodySchema`, `multipartInitBodySchema`) take `clientMetadata`. A body that still sends `metadata` fails with `VALIDATION_ERROR`. A custom `S3Api` reads `payload.clientMetadata`.
- **`metadataSchema` is `clientMetadataSchema`**, and `S3_MAX_METADATA_ENTRIES` is `CLIENT_METADATA_MAX_ENTRIES`.
- **`UNKNOWN_ROUTE` is `ROUTE_NOT_FOUND`**, like `OBJECT_NOT_FOUND` and `FOLDER_NOT_FOUND`. The status stays `404` and the message is unchanged.
- **`buildPublicObjectUrl({ baseUrl })` is `buildPublicObjectUrl({ baseURL })`**, spelled like `createS3Client({ baseURL })`.
