---
packages:
  "@dimah-s3/ui":
    replay:
      - exit-prerelease(npm:@dimah-s3/ui)
---

### ObjectList fits phones and touch screens

`ObjectList` keeps its header on one row on a phone, gives the rename field room, and sizes its controls for a finger on a touch screen.

- **One header row.** The path keeps 6rem instead of 11rem, so the controls stay beside it down to a narrow phone. `ObjectListViewToggle` shows one button under a 28rem header: the view to switch to.
- **Rename field.** In a tile the field takes the whole width, with Cancel and a filled Save under it. In a row the menu steps aside while the name is a field.
- **Touch sizes.** On a coarse pointer, the header's controls are 32px, the row menu and the rename buttons 36px, and the rows of the Move dialog 44px. The path and the dialog's buttons grow too.
- **No zoom on focus.** The rename, New folder, and search fields use 16px text on small screens, so iOS does not zoom the page when one takes focus.
