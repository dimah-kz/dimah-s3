---
packages:
  "@dimah-s3/db":
    replay:
      - exit-prerelease(npm:@dimah-s3/db)
---

### Generate the db() schema with the CLI

`@dimah-s3/db` runs on FumaDB 0.7. Its schema declares the indexes, the MySQL index prefix lengths, and the collations, so `runCli` from `@dimah-s3/db/cli` writes complete Drizzle tables and Prisma models, and `migrate` creates complete tables with Kysely, on SQLite, PostgreSQL, and MySQL.

- **`generate` needs no connection.** `runCli(DimahS3DB.client(drizzleAdapter({ db: undefined, provider })))` writes the Drizzle tables, and `prismaAdapter({ prisma: undefined, provider })` the Prisma models. Run it again after you upgrade `@dimah-s3/db`. See [Database Setup](https://s3.dimah.dev/docs/db/setup).
- **`migrate` works on MySQL.** `migrate(client)` and the CLI's `migrate` command create the same tables and indexes.
- **Drizzle tables.** The generated file exports `storageObject`, `storageFolder`, `private_dimah_s3_settings`, and `relations`. Pass `relations` to `drizzle()`, or the three tables to your own `defineRelations()`. The tables need no `@paralleldrive/cuid2`.
- **Column types.** Text columns are `varchar` on every database: `key` and `path` hold 1024 characters, `status` 16, `upload_token` 64, and the others 255. `upload_id` stays `text`, and so does the settings `value`. Sizes are `bigint`, stored as `integer` on SQLite.
- **Code that queries the generated tables.** The Drizzle tables read `size` and `declaredSize` as JavaScript `bigint` (`mode: "bigint"`), so convert them before `JSON.stringify` or arithmetic with a `number`. `id` has no default: the plugin generates ids, so a row you insert yourself needs one. `s3.db.objects` returns sizes as numbers.
- **MySQL.** Keys, scopes, and folders compare byte for byte (`utf8mb4_bin`), and `filename` ignores case (`utf8mb4_unicode_ci`). `key` and `path` are indexed on their first 512 characters, and timestamps are `datetime(3)`. Prisma has no collation attribute: add the collations to the generated migration.
- **Folder conflicts with Drizzle.** Renaming or moving a folder onto a taken name returns `FOLDER_EXISTS` through the Drizzle adapter too, instead of `500` `INTERNAL_ERROR`.
