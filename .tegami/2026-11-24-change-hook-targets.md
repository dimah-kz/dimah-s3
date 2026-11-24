---
packages:
  "@dimah-s3/db": minor
  "@dimah-s3/share": minor
---

### Change hooks get what the call loaded

The change hooks pass the rows their call already loaded, so an activity log or a search index no longer loads them again, and cannot race a concurrent move or delete. [Share API](https://s3.dimah.dev/docs/share/api#authorize-and-hooks), [change hooks](https://s3.dimah.dev/docs/db/lifecycle-hooks#change-hooks).

- **`share()` `onCreated`, `onUpdated`, `onRevoked`.** `ShareLinkEventContext` has `target`, the object or folder the link points at, as `onOpened` has. It is absent on an update or a revoke once that object or folder is gone.
- **`db()` `onObjectUpdated`.** `DbObjectUpdatedContext` has `folder`, the path of the folder the object was in (`null` at the root, absent once that folder is gone), and `destination` when the call named a `folderId`, with the shapes `authorize` sees.
