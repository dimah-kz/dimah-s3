---
packages:
  group:dimah-s3: minor
---

### Dropzone `accept` no longer guesses MIME types

`accept` is still the HTML list (`image/*`, `application/pdf`, `.pdf`). The
client no longer keeps an IANA table to invent a MIME type for extensions.

MIME types drive drag-over highlighting. Extensions are matched when the
file is dropped or picked. Prefer `application/pdf` over `.pdf` if you want
the drop target to turn green while dragging a PDF.
