---
packages:
  "@dimah-s3/react":
    replay:
      - exit-prerelease(npm:@dimah-s3/react)
---

### Retries that keep the upload, and names that match the server

Uploads recover from a failing gateway or server hook instead of starting over, and the hooks use the same words as the server and the engine.

- **Retries follow the server.** A request is sent again after a network error, an S3 `5xx`, `408`, or `429`, and any API response with `5xx`, `408`, or `429`, which includes `INTERNAL_ERROR` from a gateway or from a server hook that failed. Confirm and multipart complete are retried, and with an `uploadStore` a multipart upload that fails this way stays stored and resumes. `HOOK_FAILED` is never retried. `useObjectUrl` follows the same rule.
- **Uploads work on plain-HTTP origins.** File ids no longer come from `crypto.randomUUID`, which a phone on `http://192.168.…` does not have.
- **`handleFiles` reports rejected files.** `UploadBatchResult` gains `rejected`: the files a call refused for their type, size, or count, with their errors.
- **`cancel(ids)` and `reset(ids)`** take one id or several. `reset(ids)` removes only those settled files and keeps the rejections.
- **`retry()` keeps calls apart.** Failed files of separate calls go again as separate calls, also when the calls shared one options object.
- **`useDelete` callbacks are current.** `onSuccess`, `onError`, and `onSettled` run from the newest render, as in the other hooks.
- **Types.** `UploadCallInput`, `UploadRootProps`, and `UploadInputProps` are exported, and `onError` may return a promise in every hook.

#### Breaking changes

- **`@dimah-s3/core` is a peer dependency.** Install it at the same version as `@dimah-s3/react`.
- **`uploadOptions.metadata` is `uploadOptions.clientMetadata`**, the name the server hooks use. `UploadResult.metadata` is still the object's S3 user metadata.
- **`queue` is `append`** on `useUpload` and on a `handleFiles` call.
- **`useApi` is `useS3Api`.** The bound `s3Client.useApi()` keeps its name.
- **Download hooks: `mode` is `kind`.** `useDownload().kind` is `"navigate"` and `useFetchDownload().kind` is `"fetch"`. A download result still has `mode`, which is `"presign"` or `"proxy"`.
- **`useFetchDownload`.** The `disposition` option is removed, since the bytes are always saved, and `FetchDownloadResult.size` is `fileSize`.
- **Object lists.** The source's `getKey` is `getId`, and `removeItems` takes those ids.
- **Upload stores.** `createMemoryStore` is `createMemoryUploadStore`, and `createLocalStorageStore` is `createLocalStorageUploadStore`.
- **`retry.baseDelay` is `retry.baseDelayMs`.**
- **`onPartUpload`** receives `{ partNumber, partCount }`: `totalParts` is `partCount`.
- **`DropzoneRootProps` and `DropzoneInputProps`** are `UploadRootProps` and `UploadInputProps`.
- **File ids are not UUIDs.** `UploadFileState.id` is an opaque string. Do not parse it.
- **`UNKNOWN_ROUTE` is `ROUTE_NOT_FOUND`.**
- **Browsers from Baseline 2024.** The hooks use `Promise.withResolvers` and `AbortSignal.any`: Chrome 119, Firefox 124, Safari 17.4, or newer.
