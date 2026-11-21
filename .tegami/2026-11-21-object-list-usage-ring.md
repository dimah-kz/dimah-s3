---
packages:
  "@dimah-s3/db": minor
  "@dimah-s3/react": minor
  "@dimah-s3/ui": minor
---

### Usage follows the open folder

`ObjectListUsage` shows the open folder's bytes and file count. The ring is the size of that text; hover, focus, or click it to read the percent of the cap.

- **Open folder.** `memoryObjectSource` and the first page of `GET /db/objects` count that folder and every folder below it. The root, and a flat list, still count the whole scope. `maxBytes` and `maxFiles` stay the scope caps.
- **`db.objects.usage(scope)`** still sums the scope. Pass `{ folderId, recursive: true }` to sum a folder.
- **Ring.** The ring has no number on it. Its accessible name and tooltip are the percent. The byte cap fills it when `maxBytes` is set, and the file cap fills it otherwise. The line uses the destructive color when either cap is reached.
- **`usage` and `children`.** Pass `usage` for a different total. `null` hides the line. `children` replaces the ring and the line; a function receives `ObjectListUsageState`. `ObjectListUsageMeter` is the ring.

#### Breaking changes

- **Read a folder's own total from `usage`.** On a folder page, `usage.totalBytes` and `usage.objectCount` are that folder and the folders below it, not the whole scope. At the root they are unchanged.
