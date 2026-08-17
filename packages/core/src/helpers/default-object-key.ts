import { sanitizeFileName } from "./sanitize-file-name";

/**
 * Default object key for client uploads: a UUID prefix plus the sanitized
 * file name so two selections never overwrite the same key.
 */
export function defaultObjectKey(file: File): string {
  return `${crypto.randomUUID()}/${sanitizeFileName(file.name)}`;
}
