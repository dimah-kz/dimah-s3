---
packages:
  "@dimah-s3/ui":
    replay:
      - exit-prerelease(npm:@dimah-s3/ui)
---

### Search opens on slash, not on Shift+/

`ObjectList` opens its search on `/`. Shift+/ stays with your page, so `?` and the Persian «؟» can be your own shortcut.

- **`/`.** The slash character opens search from the list, on any key, including when a layout types it with Shift.
- **The unshifted slash key.** A layout that types a character outside ASCII there still opens search. A layout that types another ASCII character, such as `.` on a Persian layout, keeps that character.
- **Shift+slash.** `?` and «؟» do not open search.
