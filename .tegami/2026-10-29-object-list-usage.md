---
packages:
  group:dimah-s3: minor
---

### Show how full a catalog is

`useObjectList` keeps an optional `usage` from the query: bytes used and file count. A later page can omit it. A refresh or a new folder that omits it clears the value. `dbObjectQuery` forwards the scope `usage` that `listObjects` already returns. `ObjectList` shows that line when `list.usage` is set. Pass `usageLimits` with your own `maxBytes` and `maxFiles` — the same numbers as `db({ quota })` when that plugin enforces the limit — and the line includes the cap and a meter. Without limits, the line is the totals only. Without `usage`, the line stays hidden.
