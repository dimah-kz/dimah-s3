---
packages:
  "@dimah-s3/db": minor
---

### Hooks after db endpoint changes

`db()` runs a hook once a db endpoint saved its change, so an activity log, a cache, or a search index can follow renames, moves, and folders without wrapping the HTTP handler. [Change hooks](https://s3.dimah.dev/docs/db/lifecycle-hooks#change-hooks).

- **`onObjectUpdated`.** After `PATCH /db/object` renamed, moved, or set the attributes of an object, with the row `before` and `after`.
- **`onFolderCreated`, `onFolderUpdated`, `onFolderDeleted`.** After `POST`, `PATCH`, and `DELETE /db/folder`, with the `folder`, `before` and `after`, or `folder` and `recursive`. A `PATCH` that changes neither the name nor the parent does not run `onFolderUpdated`.
- **Contexts.** Each one is the caller's `ScopeContext` with its `scope`, so it has the `session`. `DbChangeContext`, `DbObjectUpdatedContext`, `DbFolderCreatedContext`, `DbFolderUpdatedContext`, `DbFolderDeletedContext`, and `DbHook` are exported.
- **Scope.** They run for `dbClient()` calls; `s3.db.objects` and `s3.db.folders` do not run them. A throw fails the call, and the change stays.
