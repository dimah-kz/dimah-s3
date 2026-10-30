---
packages:
  group:dimah-s3: minor
---

### Search and sort `db()` object listings

`GET /db/objects` (`api.db.listObjects`) and `s3.db.objects.listByScope` take `search` and `sort`.

- `search` keeps rows whose `filename` contains the text. It runs in the database (`LIKE` on SQL), so case follows its collation.
- `sort` is `{ field, direction }` with `field` set to `createdAt`, `size`, or `filename`. The default stays `createdAt` newest first. Ties break on row id, and rows without a value (a pending row's `size`, a missing `filename`) come last in both directions.
- `nextCursor` now carries the sort it was made under. Send it back with the same `sort`; under another sort it is ignored and the listing starts from the first row.

`dbObjectSource` from `@dimah-s3/db/client` forwards the list's search text and sort, mapping `name` to `filename` and `updatedAt` to `createdAt`, so `ObjectListSearch` and `ObjectListSortMenu` work with `db()`. New types: `DbListSort`, `DbListSortField`.
