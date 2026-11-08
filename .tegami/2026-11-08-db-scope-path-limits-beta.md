---
packages:
  "@dimah-s3/db":
    type: major
    replay: []
---

### Generate the schema again

`@dimah-s3/db` runs on FumaDB 0.7.1. The settings `value` column is `text` in the Drizzle tables and Prisma models `generate` writes, as in the table `migrate` creates. Run `generate` again: the ORM widens `value` from `varchar(255)` to `text`.

- **Sizes in the generated Drizzle tables are `bigint`.** Since beta.6 they read `size` and `declaredSize` with `mode: "bigint"`, where the shipped tables used `mode: "number"`. Code that queries the tables directly gets a `bigint`. `s3.db.objects` still returns numbers. The generated tables also drop the shipped `$type` on `status` and `s3Metadata`, and give `id` no default.
- **Before `drizzle-kit` changes a PostgreSQL database from the shipped files,** run the length check on [Upgrade the schema](https://s3.dimah.dev/docs/db/upgrade#postgresql). The cast it writes truncates a longer value.

#### Breaking changes

- **Folder paths are capped at 1024 UTF-8 bytes, not 1024 characters.** A create, rename, or move that makes a path longer is `FOLDER_INVALID`. Folders already stored keep working until they are renamed or moved.
