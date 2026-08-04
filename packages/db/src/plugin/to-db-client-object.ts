import type { DbClientObject, StorageObject } from "../types/storage-object";

/**
 * Map a full store row to the browser wire contract for `GET plugins/db/objects`.
 * Drops server-only fields (`scope`, `eTag`, `metadata`, `acl`, …).
 */
export function toDbClientObject(object: StorageObject): DbClientObject {
  return {
    id: object.id,
    bucket: object.bucket,
    key: object.key,
    filename: object.filename,
    contentType: object.contentType,
    size: object.size,
    declaredSize: object.declaredSize,
    status: object.status,
    createdAt: object.createdAt.toISOString(),
  };
}
