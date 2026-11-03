---
packages:
  group:dimah-s3:
    replay:
      - exit-prerelease(npm:@dimah-s3/db)
      - exit-prerelease(npm:@dimah-s3/server)
      - exit-prerelease(npm:@dimah-s3/core)
      - exit-prerelease(npm:@dimah-s3/react)
      - exit-prerelease(npm:@dimah-s3/cli)
      - exit-prerelease(npm:@dimah-s3/ui)
---

### Folder ids in db()

`@dimah-s3/db` schema `2.1.0` addresses a folder by id. An object stores `folderId`. Renaming or moving a folder updates that folder and the cached paths under it. Recreate the database; a `2.0.0` beta database is not upgraded. Details are in each package changelog and in [Upgrade the database](https://v2.s3.dimah.dev/docs/db/upgrade).

#### Breaking changes

- **Keep every `@dimah-s3/*` package on this beta.** `folder` on a `db()` object is now `folderId`, and uploads send `clientMetadata.folderId` for a folder that already exists.
