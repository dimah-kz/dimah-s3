---
packages:
  "@dimah-s3/db":
    type: major
    replay: []
---

### Shipped schema files replaced by `generate`

A database at schema `2.1.0` from an earlier beta keeps working. Generate the schema for your ORM and point it at the generated file. See [Upgrade the schema](https://s3.dimah.dev/docs/db/upgrade).

#### Breaking changes

- **`@dimah-s3/db/drizzle/sqlite`, `/drizzle/pg`, and `/drizzle/mysql` are removed, with `dimahS3Tables`.** Write the tables with `runCli` → `generate`, then import `relations` (or `storageObject`, `storageFolder`, and `private_dimah_s3_settings`) from the generated file.
- **`prisma/dimah-s3.prisma` and `sql/<dialect>.sql` are no longer published.** Generate the Prisma models with `runCli` → `generate`. With Kysely, create the tables with `migrate(client)`.
- **`drizzle-kit` and Prisma Migrate report small changes** against tables created from the shipped files: `varchar` lengths on PostgreSQL text columns, and the SQLite timestamp default. They do not change what the plugin reads. Apply them.
- **A database left at the empty `0.0.1` step is no longer recognized.** `migrate:up` stopped there before it created the tables. Drop `private_dimah_s3_settings`, the only table at that step, and run `migrate` again.
