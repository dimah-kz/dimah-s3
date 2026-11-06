---
packages:
  "@dimah-s3/ui": major
---

### The object list is one tab stop

`ObjectList` takes one Tab however many entries it shows, reads the selection count out, and stops drawing every entry while an upload reports progress.

- **One tab stop.** Tab lands on the entry that last had focus, or the first one. Tab and Shift+Tab go through that entry's checkbox, menu, and actions, then leave the list.
- **ArrowLeft and ArrowRight** move between a row's checkbox, name, and menu in the list view. In the grid they still move between tiles.
- **F2** renames the focused entry from any of its controls.
- **Selection count.** The list's polite live region is mounted with the list and reads "{count} selected" each time the count changes, also the first time.
- **Fewer renders.** `ObjectListRow` and `ObjectListTile` are memoized. An entry draws again when it changes, when its selection, rename, or tab stop does, or when a `render*` function does. Upload progress, downloads, and deletes elsewhere in the list leave it alone.
- **`data-entry-key`** on each row and tile holds `entry.key`.
- **`ObjectListCheckbox`** takes `tabIndex`.

#### Breaking changes

- **Reach an entry's checkbox and menu from the entry.** They have `tabIndex={-1}`, and so does an `ObjectListItemMenu` inside an entry. Update tests that tab through the rows. Give your own controls in `renderActions` `tabIndex={-1}` too, so Tab lands on the entry and not on them.
- **Keep `render*` functions in step with the state they read.** A memoized entry calls `renderActions`, `renderDescription`, and `renderMeta` again only when the function changes. Define them outside the component, or with `useCallback` and the state they read.
- **The selection bar's count has no `aria-live`.** The list's own live region reads it. A bar of your own that read the count out can drop its live region.
