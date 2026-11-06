---
packages:
  "@dimah-s3/react":
    replay:
      - exit-prerelease(npm:@dimah-s3/react)
---

### Per-call queueing, and list state that follows the rows

An upload call can pick its own queue mode, the object-list hooks keep their state in step with the rows on screen, and the formatter and type names line up with the rest of the API.

- **`handleFiles(files, { queue })`** overrides the hook's `queue` for one call: `true` appends and leaves the files in flight alone, `false` replaces the queue. `UploadCallOptions` gains `queue`.
- **Selection follows the rows.** Without `persist`, `useObjectListSelection` drops an entry that a reload or search no longer returns, so it does not come back selected when it shows again.
- **Search resets with the folder.** A controlled `parent` that changes from outside, such as on browser back, clears the search the way `openFolder` does, and the old search never loads in the new folder.
- **`createFolder` reloads under a name sort or a search**, as a rename does, so the new folder shows where the source puts it.
- **Engine types.** `@dimah-s3/react/engine` exports the types its functions take and return: `UploadRequestOptions`, `UploadEnginePhase`, `UploadResult`, `TransferProgress`, `ObjectListSource`, `ObjectListFile`, `ObjectListFolder`, `ObjectListPage`, `ObjectListQuery`, `ObjectListQueryInput`, `ObjectListSort`, and `ObjectListUsageData`.
- **Named option types.** `FetchDownloadOptions` types `useFetchDownload().download(key, options)`, and `DeleteOptions` types `useDelete().remove(key, options)`.

#### Breaking changes

- **Rename `useFormatDimahError` to `useFormatError`.** It works the same, and its name now matches the other `useFormat*` hooks.
- **Rename the `ObjectListUsage` type to `ObjectListUsageData`.** The old name clashed with the `ObjectListUsage` component from `@dimah-s3/ui`.
- **`useDownload` drops `presignMany`** and the `PresignManyResult` type. Call `presign(key)` for each key, or use `useObjectUrl` for previews, which caches and refreshes each URL.
- **`@dimah-s3/react/engine` drops `formatSpeed` and `formatUploadProgress`.** Use `useFormatSpeed()` and `useFormatFileSize()`, which follow the `S3Provider` locale and translations.
