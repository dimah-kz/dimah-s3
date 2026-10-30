import { fileNameFromKey, formatFileSize } from "@dimah-s3/core";
import type { DbClientObject } from "@/types/storage-object";

/** Accessors that map a `listObjects` row onto `ObjectList`. */
export type DbObjectListAccessors = {
  /** Row id. */
  getKey: (object: DbClientObject) => string;
  /** Stored object key. Bulk delete uses this. */
  getObjectKey: (object: DbClientObject) => string;
  /** Filename, or the last segment of the key. */
  getLabel: (object: DbClientObject) => string;
  /** Same name the type glyph uses. */
  getFileName: (object: DbClientObject) => string;
  getFileType: (object: DbClientObject) => string | null;
  /** Verified size. `null` while the object is still pending. */
  getDescription: (object: DbClientObject) => string | null;
};

/** Options for {@link dbObjectListAccessors}. */
export type DbObjectListAccessorsOptions = {
  /**
   * Size label for `getDescription`. In React, pass `useFormatFileSize()`
   * from `@dimah-s3/react` to follow the `S3Provider` `locale`.
   */
  formatSize?: (bytes: number) => string;
};

function displayName(object: DbClientObject): string {
  return object.filename || fileNameFromKey(object.key) || object.key;
}

/**
 * Map `api.db.listObjects` rows onto `ObjectList` accessors.
 *
 * This does not invent folders. Pass the result of `dbObjectQuery` as `list`.
 *
 * ```tsx
 * const files = dbObjectListAccessors();
 *
 * <ObjectList list={list} {...files} />
 * ```
 */
export function dbObjectListAccessors(
  options: DbObjectListAccessorsOptions = {},
): DbObjectListAccessors {
  const formatSize =
    options.formatSize ?? ((bytes: number) => formatFileSize(bytes));
  return {
    getKey: (object) => object.id,
    getObjectKey: (object) => object.key,
    getLabel: displayName,
    getFileName: displayName,
    getFileType: (object) => object.contentType,
    getDescription: (object) =>
      object.size != null ? formatSize(object.size) : null,
  };
}
