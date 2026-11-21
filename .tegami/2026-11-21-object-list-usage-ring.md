---
packages:
  "@dimah-s3/ui":
    replay:
      - exit-prerelease(npm:@dimah-s3/ui)
---

### Compact usage ring

`ObjectListUsage` shows the catalog total as a text-sized ring beside the bytes and the file count. Hover, focus, or click the ring to read the percent of the cap.

- **The line stays the catalog.** `list.usage` from `dbObjectSource` and `memoryObjectSource` is every record, in every folder. `maxBytes` and `maxFiles` are the scope caps. Pass `usage` to show a different total, such as one folder. `null` hides the line.
- **The ring follows bytes.** When `maxBytes` is set, the ring is the byte cap. It uses `maxFiles` only when there is no byte cap. The line uses the destructive color when either cap is reached.
- **`children`.** Replaces the ring and the line. A function receives `ObjectListUsageState`. `ObjectListUsageMeter` is the ring.
