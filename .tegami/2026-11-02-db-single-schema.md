---
packages:
  "@dimah-s3/db":
    replay:
      - exit-prerelease(npm:@dimah-s3/db)
---

### One database schema

`@dimah-s3/db` reads schema `2.0.0` only. A database already at `2.0.0` is unchanged.

#### Breaking changes

- **No upgrade from a 1.x database.** `sql/upgrade/1.0.0-2.0.0/` is gone, and `migrate(client)` only creates schema `2.0.0`. Create the tables on a new database with `sql/<dialect>.sql`, your ORM, or `migrate(client)` on an empty database. A database at any other version throws. See [Upgrade the database](https://v2.s3.dimah.dev/docs/db/upgrade).
- **`v2` is no longer exported.** The schema is internal. `DB_SCHEMA_VERSION` is still `2.0.0`.
