import type {
  DbClientFolder,
  DbClientObject,
  DbClientObjectStatus,
} from "@/types/client";
import type { StorageFolder, StorageObject } from "@/types/storage-object";

/**
 * Maps a store row to the browser wire shape. Drops server-only fields
 * (`scope`, `eTag`, `s3Metadata`, `acl`, upload state). `toClient` maps the
 * stored attributes; without it the browser sees them as stored.
 */
export function toDbClientObject<TAttributes, TClientAttributes = TAttributes>(
  object: StorageObject<TAttributes>,
  toClient?: (attributes: TAttributes) => TClientAttributes,
): DbClientObject<TClientAttributes> {
  const { attributes } = object;
  return {
    id: object.id,
    bucket: object.bucket,
    key: object.key,
    route: object.route,
    folder: object.folder,
    filename: object.filename,
    contentType: object.contentType,
    size: object.size,
    declaredSize: object.declaredSize,
    // Purging rows never reach the browser: listings and GET /db/object
    // leave them out.
    status: object.status as DbClientObjectStatus,
    attributes:
      attributes === null
        ? null
        : toClient
          ? toClient(attributes)
          : // Without `toClient`, the client attributes are the stored ones.
            (attributes as unknown as TClientAttributes),
    createdAt: object.createdAt.toISOString(),
    updatedAt: object.updatedAt.toISOString(),
  };
}

/** Maps a `storage_folder` row to the browser wire shape. */
export function toDbClientFolder(folder: StorageFolder): DbClientFolder {
  return {
    path: folder.path,
    name: folder.name,
    parent: folder.parent,
    createdAt: folder.createdAt.toISOString(),
  };
}
