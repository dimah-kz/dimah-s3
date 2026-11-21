---
packages:
  "@dimah-s3/db": minor
  "@dimah-s3/react": minor
  "@dimah-s3/ui": minor
---

### Folder rows show what they hold

A folder row shows how many files it holds and how large it is, on the same line a file uses for its size and date.

- **The whole folder.** The count and the bytes include that folder and every folder below it. An empty folder is `0`. `memoryObjectSource` measures the records it holds. `GET /db/objects` sends `size` and `objectCount` on each folder of the page.
- **`ObjectListFolder`.** `size` and `objectCount` are optional. Leave them out when a source does not know, and the line stays empty.
- **Your own second line.** `renderDescription` still replaces it.
