---
packages:
  "@dimah-s3/ui":
    replay:
      - exit-prerelease(npm:@dimah-s3/ui)
---

### Pause and resume in the upload family

`UploadStatus`, `UploadFileList`, `UploadToasts`, and `AvatarUpload` show paused files and resume them through `upload.resume`.

- **Pause in `UploadStatus`.** It appears while a multipart upload is in flight, since that upload resumes from its uploaded parts, and calls `upload.pause()`.
- **Paused files.** A paused file reads "Paused", keeps its progress ring, and has a resume action next to cancel. Once every file in flight is paused, the multi-file summary reads "{percent}% · Paused" and offers resume for all of them; dismiss waits until the queue settles.
- **`UploadToasts`.** While the queue is paused, the progress toast reads "Upload paused" with a Resume action, and the result toast waits until the queue settles.
- **`AvatarUpload`.** A paused image keeps its preview and its progress ring, and the live region says "Paused".
- **Translations.** New keys: "Paused" (note `upload status`), "Resume" (`upload control`), "Resume {name}" (`attachment action`), "Upload paused" (`toast`), and "Resume" (`toast action`).

#### Breaking changes

- **Expect Pause in `UploadStatus` to keep files in the queue.** It calls `upload.pause()` in place of `upload.detach()`, so the files stay, paused, until resumed or cancelled. It shows for a multipart upload with or without an `uploadStore`, and no longer for a smaller file that would start over. Call `upload.detach()` from your own control to stop and clear the queue.
