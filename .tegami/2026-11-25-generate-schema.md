---
packages:
  "@dimah-s3/db": minor
---

### One schema file for db and share

`generateSchema` from `@dimah-s3/db/cli` writes the Drizzle or Prisma schema of several clients into one file. It is FumaDB's `generateSchema`, so your app does not need to depend on `fumadb`. [PostgreSQL schema](https://s3.dimah.dev/docs/share#create-the-table-step).

- **PostgreSQL schema.** With `@dimah-s3/db` and `@dimah-s3/share` in one schema, such as `names.schema("storage")`, generate both with `generateSchema([dimahS3Db, dimahS3Share])`: the file declares `pgSchema("storage")` once, so `drizzle-kit` accepts it and creates the schema. It replaces the hand-written file that re-exported both generated files.
