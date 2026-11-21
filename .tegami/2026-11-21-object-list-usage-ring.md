---
packages:
  "@dimah-s3/ui": minor
---

### Compact usage ring

`ObjectListUsage` shows storage as a small ring behind the percent, on the same line as the bytes and the file count.

- **The ring follows bytes.** When `maxBytes` is set, the ring is the byte cap. It uses `maxFiles` only when there is no byte cap. The line is marked when either cap is reached.
- **`usage`.** Pass totals of your own, such as the open folder. `list.usage` stays the scope total from `dbObjectSource` and `memoryObjectSource`. `null` hides the line.
- **`children`.** Replaces the ring and the line. A function receives the usage on screen (`ObjectListUsageState`). `ObjectListUsageMeter` is the ring.
