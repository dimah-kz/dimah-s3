---
packages:
  group:dimah-s3: minor
---

### Dropzone `accept` uses HTML tokens directly

`accept` is still the HTML list (`image/*`, `application/pdf`, `.pdf`). The
native file input gets that string. Type checks go through `validateFile`
(dropzone `validator` at intake, and again on programmatic `upload()`). There
is no MIME-map helper and no IANA table.
