import { s3Error } from "@dimah-s3/core";

/**
 * Logical folder paths. A path is NFC-normalized and `/`-separated, with no
 * leading or trailing `/`. `null` is the root. The wire addresses a folder
 * by id; the path is the cached label of that id.
 */

/**
 * Longest folder path, in UTF-8 bytes, like an S3 key. With the longest scope,
 * the `(scope, path)` unique key stays under PostgreSQL's 2704-byte limit
 * for a btree entry.
 */
export const FOLDER_PATH_MAX_BYTES = 1024;

/** Longest folder name (one path segment), in characters. */
export const FOLDER_NAME_MAX_LENGTH = 255;

/** Most segments in a folder path. Each one is a row the server keeps. */
export const FOLDER_MAX_DEPTH = 32;

/** Control characters and lone surrogates. */
const INVALID_CHARACTER = /[\p{Cc}\p{Cs}]/u;

const utf8 = new TextEncoder();

/** Counts code points, so a character outside the BMP counts once. */
export function characterCount(value: string): number {
  return Array.from(value).length;
}

/** True when `name` can be one segment of a folder path. */
export function isFolderName(name: string): boolean {
  const length = characterCount(name);
  return (
    length >= 1 &&
    length <= FOLDER_NAME_MAX_LENGTH &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !INVALID_CHARACTER.test(name)
  );
}

/**
 * Returns the NFC form of `path`, or `null` when it is not a valid folder
 * path. The root (`""`) is not a folder path.
 */
export function normalizeFolderPath(path: string): string | null {
  if (!path.isWellFormed()) return null;
  const normalized = path.normalize("NFC");
  if (utf8.encode(normalized).byteLength > FOLDER_PATH_MAX_BYTES) return null;
  const names = normalized.split("/");
  if (names.length > FOLDER_MAX_DEPTH) return null;
  return names.every(isFolderName) ? normalized : null;
}

/**
 * Reads a wire folder value. `""` is the root and returns `null`.
 * @throws `FOLDER_INVALID` when the value is not a valid folder path.
 */
export function parseFolder(value: string): string | null {
  if (value === "") return null;
  const path = normalizeFolderPath(value);
  if (path === null) throw s3Error("FOLDER_INVALID");
  return path;
}

/** Writes a folder for the wire. The root becomes `""`. */
export function formatFolder(folder: string | null): string {
  return folder ?? "";
}

/**
 * The path of `name` inside `parent`. `null` when `name` is not a folder
 * name or the joined path is too long or too deep.
 */
export function childFolderPath(
  parent: string | null,
  name: string,
): string | null {
  if (!isFolderName(name)) return null;
  return normalizeFolderPath(joinFolderPath(parent, name));
}

/** Appends `name` to `parent`. The result is not validated. */
export function joinFolderPath(parent: string | null, name: string): string {
  return parent === null ? name : `${parent}/${name}`;
}

/** The folder that contains `path`. `null` for a top-level folder. */
export function parentFolderPath(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index === -1 ? null : path.slice(0, index);
}

/** The last segment of `path`. */
export function folderName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Every folder from the top level down to `path` itself. */
export function folderAncestors(path: string): string[] {
  const segments = path.split("/");
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}
