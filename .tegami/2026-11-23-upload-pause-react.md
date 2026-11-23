---
packages:
  "@dimah-s3/react":
    replay:
      - exit-prerelease(npm:@dimah-s3/react)
---

### Pause and resume uploads

`useUpload` pauses files and resumes them where they stopped. A multipart upload continues from the parts S3 already has, with or without an `uploadStore`, while the page stays open.

- **`upload.pause(ids?)`.** Stops one file, several, or every file, including the files of a call still preparing. A paused file stays in the queue with its progress, as phase `"paused"`, and frees its upload slot. A file that is `"finalizing"` finishes instead.
- **`upload.resume(ids?)`.** Queues paused files again. A multipart upload continues from its uploaded parts; a single-shot upload starts over. The request options resolved before the pause are sent again, so an `uploadOptions` function does not run twice.
- **A paused file has not ended.** The `handleFiles` promise, `onSuccess`, `onError`, and `onSettled` wait until it is resumed and finishes, or is cancelled.
- **Without an `uploadStore`.** The hook keeps the multipart session of a paused file for the page session. A cancel, a failure, `detach()`, or an unmount aborts it, as before.
- **`reset()` keeps paused files.** It removes only files that uploaded or failed. `cancel()` removes a paused file and aborts its multipart upload; `detach()` and an unmount remove it and keep its record in an `uploadStore`.

#### Breaking changes

- **Handle `"paused"` in `UploadFilePhase` and `UploadPhase`.** A file is `"paused"` between `pause` and `resume`. The queue is `"paused"` while a file is paused and none is in flight; `isPending` is then `false`. A `switch` that lists every phase needs the new case.
