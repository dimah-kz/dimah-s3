---
packages:
  "@dimah-s3/react":
    replay:
      - exit-prerelease(npm:@dimah-s3/react)
---

### Search scope and result locations in useObjectList

`useObjectList` can search the open folder and the folders below it, or everywhere, and keeps where each result lives.

- **`searchScope`.** `"folder"` (the default) looks in the open folder and every folder below it, `"all"` everywhere. Control it with `searchScope` / `onSearchScopeChange`, or start with `defaultSearchScope`. The query receives it, and changing it reloads only while something is searched. A source lists the scopes it understands in `searchScopes`.
- **`location`.** A folder or file of a search can carry `location`, the folders from the root down to the one that holds it. Entries copy it, and `openFolder` on a folder with a `location` opens its whole path.
- **`total`.** A first page can send `total`, the files that match across every page. The hook returns it while searching.
- **New on the return:** `isSearching`, `searchScope`, `setSearchScope`, `searchScopes`, and `total`.
- **`memoryObjectSource`** with `getFolder` searches below the open folder or every record, returns the matching folders with their `location`, sends `total`, and adds each record's `location` to `getFile`. It matches with `matchesSearchText` from `@dimah-s3/core`, so look-alike letters and Persian digits match too.

#### Breaking changes

- **`ObjectListQueryInput` has `searchScope`.** Pass it when you call a source's `query` yourself.
- **`memoryObjectSource` searches below the open folder.** A search used to match the open folder only. To keep that, write your own `query` over `readObjectListLevel`.
