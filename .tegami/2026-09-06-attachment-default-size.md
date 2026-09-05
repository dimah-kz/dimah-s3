---
packages:
  group:dimah-s3: patch
---

### Default attachment rows to stock `default` size

`FileAttachment` and `StatusAttachment` now default to stock Attachment `size="default"` instead of `sm`. Wired upload, download, and delete status rows follow the same default unless you pass `attachmentSize`.
