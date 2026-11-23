---
packages:
  "@dimah-s3/ui":
    replay:
      - exit-prerelease(npm:@dimah-s3/ui)
---

### Search that shows where results live

`ObjectList` search works across folders: results say which folder they are in, the matching text is marked, and you can choose where to look.

- **`ObjectListSearchBar`.** While a search is on, `ObjectListHeader` shows it under the bar: "Search in" with the open folder or the root, when the source can search both, and the result count, which the list's live region reads out. Pass `searchBar={false}` to the header to hide it.
- **Results.** A row from another folder starts its second line with `ObjectListLocation` (`Docs › 2024`), and `FileName` marks the match through its new `highlight` prop. Opening a folder result opens its whole path.
- **Show in folder.** The menu of a result leaves the search, opens its folder, and focuses the entry there.
- **`ObjectListSearch`.** The placeholder names where it looks (`Search in “Docs”`), a spinner shows while results load, `/` from the list opens it, and ArrowDown moves into the results.
- **Empty search.** The empty state names where it looked and offers Search everywhere and Clear search.
