---
packages:
  "@dimah-s3/db":
    type: major
    replay: []
---

### Timestamps written by Kysely outside UTC

#### Breaking changes

- **Kysely timestamps are UTC on PostgreSQL and MySQL.** Earlier betas wrote them in the local time of the process. If a Kysely process outside UTC wrote your rows, they now read shifted by its offset. Rewrite them once with the query on [Upgrade the schema](https://s3.dimah.dev/docs/db/upgrade#timestamps-written-by-kysely-outside-utc). Rows written by Drizzle or Prisma, or by a Kysely process in UTC, are unchanged.
