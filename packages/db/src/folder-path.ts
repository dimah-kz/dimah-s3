import { s3Error } from "@dimah-s3/core";

/**
 * Logical folder paths. A path is NFC-normalized and `/`-separated, with no
 * leading or trailing `/`. `null` is the root in types and JSON. On the wire
 * (`?folder=`, `clientMetadata.folder`) the root is `""`.
 */

/** Longest folder path, in characters. */
export const FOLDER_PATH_MAX_LENGTH = 1024;

/** Longest folder name (one path segment), in characters. */
export const FOLDER_NAME_MAX_LENGTH = 255;

/** Control characters and lone surrogates. */
const INVALID_CHARACTER = /[\p{Cc}\p{Cs}]/u;

/** Counts code points, so a character outside the BMP counts once. */
function characterCount(value: string): number {
  return Array.from(value).length;
}

function isValidName(name: string): boolean {
  const length = characterCount(name);
  return (
    length >= 1 &&
    length <= FOLDER_NAME_MAX_LENGTH &&
    name !== "." &&
    name !== ".." &&
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
  if (characterCount(normalized) > FOLDER_PATH_MAX_LENGTH) return null;
  return normalized.split("/").every(isValidName) ? normalized : null;
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
