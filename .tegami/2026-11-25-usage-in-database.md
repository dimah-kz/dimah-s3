---
packages:
  "@dimah-s3/db": minor
---

### Usage summed in the database

`s3.db.objects.usage`, the byte quota checked before each upload, and the folder sizes of a listing sum the sizes in the database, instead of reading one row per object. A scope with many files no longer reads all of them to accept one more.

- **Same totals.** A pending upload counts its declared size, an active file its size, and an overwrite in flight the larger of the two, as before. Only the rows of overwrites in flight are read.
