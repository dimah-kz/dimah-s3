/** Machine-readable codes for client-side file validation failures. */
export type ValidateFileErrorCode =
  "FILE_TYPE_NOT_ALLOWED" | "FILE_EMPTY" | "FILE_TOO_LARGE";

/** Result of {@link validateFile} when the file fails a check. */
export type ValidateFileError = {
  code: ValidateFileErrorCode;
  /** English fallback message (localize via Fuma when a translator is available). */
  message: string;
  /** Interpolation params for i18n (e.g. `{ type }`, `{ size }`). */
  params?: Record<string, string | number>;
};

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
      return type.startsWith(token.replace("/*", "/"));
    }
    return type === token;
  });
}

/**
 * Client-side accept / size / empty checks before starting an upload.
 * Returns `null` when the file is valid.
 */
export function validateFile(
  file: File,
  options: { accept?: string[]; maxFileSize?: number },
): ValidateFileError | null {
  if (options.accept?.length) {
    if (!matchesFileTypes(file.name, file.type, options.accept)) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : null;
      const type = ext ? `.${ext}` : file.type || "unknown";
      return {
        code: "FILE_TYPE_NOT_ALLOWED",
        message: `File type "${type}" is not allowed`,
        params: { type },
      };
    }
  }

  if (file.size === 0) {
    return {
      code: "FILE_EMPTY",
      message: "File is empty",
    };
  }

  if (options.maxFileSize && file.size > options.maxFileSize) {
    const maxMB = (options.maxFileSize / (1024 * 1024)).toFixed(1);
    return {
      code: "FILE_TOO_LARGE",
      message: `File size exceeds ${maxMB} MB limit`,
      params: { size: `${maxMB} MB` },
    };
  }

  return null;
}
