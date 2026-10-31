---
packages:
  group:dimah-s3: minor
---

### Search and sort `db()` object listings

`GET /db/objects` (`api.db.listObjects`) and `s3.db.objects.list` take `search` and `sort`.

- `search` keeps rows whose `filename` contains the text. It runs in the database (`LIKE` on SQL), so case follows its collation.
- `sort` is `{ field, direction }` with `field` set to `createdAt`, `updatedAt`, `size`, or `filename`. The default stays `createdAt` newest first. Ties break on row id, and rows without a value (a pending row's `size`) come last in both directions.
- `nextCursor` carries the filters and sort it was made under. Send it back with the same ones; under others it is ignored and the listing starts from the first row.

`dbObjectSource(api.db, …)` from `@dimah-s3/db/client` forwards the list's search text and sort, mapping `name` to `filename` and keeping `size` and `updatedAt`, so `ObjectListSearch` and `ObjectListSortMenu` work with `db()`. Sorting by date orders by the row's `updatedAt`, the same value `getFile().updatedAt` returns. New types: `DbListSort`, `DbListSortField`.
