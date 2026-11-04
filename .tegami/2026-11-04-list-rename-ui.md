---
packages:
  "@dimah-s3/ui":
    replay:
      - exit-prerelease(npm:@dimah-s3/ui)
---

### Rename in the object list

`ObjectList` adds Rename to a row when that row's source can rename it. The name becomes a field. Enter saves, Escape or Cancel restores the name, and leaving the field saves it. F2 starts the rename from the row. Download and Copy link then send the saved name.
