---
packages:
  "@dimah-s3/db":
    replay:
      - exit-prerelease(npm:@dimah-s3/db)
---

### Folders are rows with ids

A folder is its id. An object stores `folderId` instead of a path. Renaming or moving a folder rewrites the cached paths under it and leaves every object id as it is. `PATCH /db/folder` renames (`name`) and moves (`parentId`). `createFolder` creates one folder inside a parent that already exists. An upload's `clientMetadata.folderId` must name that folder. The list's first page includes `trail`, from the root down to the open folder.

The database schema is `2.1.0`. Create it on a new database. A `2.0.0` beta database is not upgraded.

#### Breaking changes

- **Schema `2.1.0` replaces `2.0.0`.** `storage_object.folder` is now `folder_id`. `storage_folder` stores `parent_id` (`""` is the root), `name`, and a cached `path`, plus `updated_at`. Recreate the tables from `sql/<dialect>.sql`, the Drizzle or Prisma schema, or `migrate(client)` on an empty database. A database at `2.0.0` throws.
- **Folder addresses are ids.** `GET /db/objects` takes `folderId` (`""` is the root). `PATCH /db/object` takes `folderId`. `POST /db/folder` takes `{ parentId, name }`. `PATCH /db/folder` takes `{ id, name?, parentId? }`. `DELETE /db/folder` takes `id`. `DbClientObject.folder` is `folderId`. `DbClientFolder` is `{ id, name, parentId, path, createdAt, updatedAt }`.
- **Uploads no longer create folders.** Set `clientMetadata.folderId` to an existing folder. A missing id is `FOLDER_NOT_FOUND` (`404`). `s3.db.folders.ensure` is removed. `create` takes `{ parentId, name }`, and `update` renames or moves.
- **`dbObjectSource` parents are folder ids.** Uploads send `metadata.folderId`. The first page's `trail` fills the breadcrumb.
