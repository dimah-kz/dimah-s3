---
packages:
  group:dimah-s3: major
---

### Search reaches every folder

A search in the file list finds files in the open folder and every folder below it, or everywhere, and each result says where it lives. Search matches the same way in the database, in memory, and in the highlight: case, accents, and look-alike letters do not count. `@dimah-s3/db` moves to schema `2.2.0`, which you create on a new database. Each package changelog lists its own changes, and [Upgrade the database](https://s3.dimah.dev/docs/db/upgrade) covers the schema.

#### Breaking changes

- **Keep every `@dimah-s3/*` package on the same version.** `dbObjectSource` sends `recursive` to `GET /db/objects`, which an older `@dimah-s3/db` rejects.
- **Review `authorize` rules that allow some folders and deny others.** A search now lists every folder below the open one with `recursive: true`. See the `@dimah-s3/db` changelog.
