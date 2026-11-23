---
packages:
  "@dimah-s3/db":
    replay:
      - exit-prerelease(npm:@dimah-s3/db)
  "@dimah-s3/react":
    replay:
      - exit-prerelease(npm:@dimah-s3/react)
  "@dimah-s3/ui":
    replay:
      - exit-prerelease(npm:@dimah-s3/ui)
---

### Folder rows show what they hold

A folder row shows how many files it holds and how large it is, on the same line a file uses for its size and date.

- **The whole folder.** The count and the bytes include that folder and every folder below it. An empty folder is `0`. `memoryObjectSource` measures the records it holds. `GET /db/objects` sends `size` and `objectCount` on each folder of the page. The list's `usage` stays the whole scope.
- **`db.objects.usage(scope)`.** Still sums the scope. Pass `{ folderId, recursive: true }` to sum one folder yourself.
- **`ObjectListFolder`.** `size` and `objectCount` are optional. Leave them out when a source does not know, and the line stays empty.
- **Your own second line.** `renderDescription` still replaces it.
