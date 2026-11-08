---
packages:
  "@dimah-s3/db":
    replay:
      - exit-prerelease(npm:@dimah-s3/db)
---

### UTC timestamps and PostgreSQL schemas

`@dimah-s3/db` runs on FumaDB 0.7.2.

- **Timestamps are UTC on every adapter.** On PostgreSQL and MySQL, the Kysely adapter writes and reads the timestamp columns in UTC, as Drizzle and Prisma do, whatever the time zone of the process. Instances in different zones agree on deadlines like `expiresAt`.
- **Tables in a PostgreSQL schema.** Create the client from `DimahS3DB.names.schema("storage")` to keep the tables in the `storage` schema. `migrate` creates it, the generated Drizzle tables declare it with `pgSchema("storage")`, and the generated Prisma models with `@@schema("storage")`. The settings table, `private_dimah_s3_settings`, stays in the search path. See [Database Setup](https://s3.dimah.dev/docs/db/setup).
