import { s3Error, type APIError } from "../error";
import { describeFileType } from "./content-type";

/**
 * Whether `fileName` / `contentType` match HTML `accept` / route `fileTypes`
 * tokens (`image/*`, `application/pdf`, `.png`).
 */
export function matchesFileTypes(
  fileName: string,
  contentType: string | undefined,
  fileTypes: readonly string[],
): boolean {
  if (!fileTypes.length) return true;
  const type = contentType ?? "";
  return fileTypes.some((token) => {
    if (token.startsWith(".")) {
      return fileName.toLowerCase().endsWith(token.toLowerCase());
    }
    if (token.endsWith("/*")) {
      return type.startsWith(token.slice(0, -1));
    }
    return type === token;
  });
}

/**
 * Client-side accept / empty / size checks before starting an upload.
 * Returns `null` when the file is valid, otherwise a catalog error:
 * `FILE_TYPE_NOT_ALLOWED`, `FILE_EMPTY`, or `FILE_TOO_LARGE`.
 * The name is not checked: `fitFileName` fits it to the wire rule.
 */
export function validateFile(
  file: Blob & { name: string },
  options: { accept?: readonly string[]; maxFileSize?: number },
): APIError | null {
  const { accept, maxFileSize } = options;
  if (accept?.length && !matchesFileTypes(file.name, file.type, accept)) {
    return s3Error("FILE_TYPE_NOT_ALLOWED", {
      type: describeFileType(file.name, file.type),
      allowed: accept.join(", "),
    });
  }
  if (file.size === 0) {
    return s3Error("FILE_EMPTY");
  }
  if (typeof maxFileSize === "number" && file.size > maxFileSize) {
    return s3Error("FILE_TOO_LARGE", { size: file.size, maxFileSize });
  }
  return null;
}
