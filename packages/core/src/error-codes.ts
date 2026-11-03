/**
 * One catalog entry: HTTP `status`, an English `message` template with
 * `{param}` placeholders, and `client: true` on codes only the browser raises.
 */
export type S3ErrorEntry = { status: number; message: string; client?: true };

/**
 * Tag each catalog entry with its own key as `code`.
 * Same idea as Better Auth `defineErrorCodes`.
 */
export function defineErrorCodes<const T extends Record<string, S3ErrorEntry>>(
  codes: T,
): { readonly [K in keyof T]: { readonly code: K } & T[K] } {
  const entries = {} as { [K in keyof T]: { readonly code: K } & T[K] };
  for (const code of Object.keys(codes) as (keyof T)[]) {
    entries[code] = { code, ...codes[code] };
  }
  return entries;
}

/**
 * Every error code the protocol knows, with its status and message template.
 * Entries flagged `client` are raised in the browser and never sent by the
 * server.
 */
export const S3_ERROR_CODES = defineErrorCodes({
  // protocol
  VALIDATION_ERROR: { status: 400, message: "Invalid request: {issue}" },
  REQUEST_TOO_LARGE: {
    status: 413,
    message: "Request body exceeds {maxSize} bytes",
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: "Request body must be application/json",
  },
  NOT_FOUND: { status: 404, message: "Not found" },
  UNAUTHORIZED: { status: 401, message: "Unauthorized" },
  FORBIDDEN: { status: 403, message: "Forbidden" },
  /** A concurrent change won; retrying may succeed. */
  CONFLICT: { status: 409, message: "Conflict" },
  INTERNAL_ERROR: { status: 500, message: "Internal server error" },
  S3_NETWORK_ERROR: {
    status: 502,
    message: "S3 endpoint unreachable ({code})",
  },
  UNKNOWN_ROUTE: { status: 404, message: 'Unknown file route "{route}"' },
  FEATURE_DISABLED: { status: 404, message: "{feature} is disabled" },
  KEY_INVALID: { status: 400, message: "Object key is invalid" },
  OBJECT_NOT_FOUND: { status: 404, message: "Object not found" },
  RANGE_NOT_SATISFIABLE: {
    status: 416,
    message: "Requested range not satisfiable",
  },
  PRECONDITION_FAILED: { status: 412, message: "Precondition failed" },
  // files
  FILE_EMPTY: { status: 400, message: "File is empty" },
  FILE_TOO_LARGE: {
    status: 413,
    message: "File is {size} bytes; the limit is {maxFileSize} bytes",
  },
  FILE_TYPE_NOT_ALLOWED: {
    status: 400,
    message: 'File type "{type}" is not allowed',
  },
  FILE_CONTENT_MISMATCH: {
    status: 400,
    message: 'File content does not match type "{type}"',
  },
  CHECKSUM_REQUIRED: {
    status: 400,
    message: "A SHA-256 checksum is required",
  },
  QUOTA_EXCEEDED: { status: 403, message: "Storage quota exceeded" },
  // upload sessions
  UPLOAD_TICKET_INVALID: { status: 403, message: "Upload ticket is invalid" },
  UPLOAD_TICKET_EXPIRED: { status: 410, message: "Upload ticket has expired" },
  UPLOAD_SIZE_MISMATCH: {
    status: 400,
    message: "Uploaded {actual} bytes; expected {expected}",
  },
  MULTIPART_PART_MISSING: {
    status: 400,
    message: "Uploaded part {partNumber} was not found",
  },
  MULTIPART_PART_INVALID: {
    status: 400,
    message: "Part {partNumber} is outside 1..{partCount}",
  },
  // db plugin
  OBJECT_EXISTS: {
    status: 409,
    message: "An object already exists at this key",
  },
  FOLDER_INVALID: { status: 400, message: "Folder path is invalid" },
  FOLDER_NOT_FOUND: { status: 404, message: "Folder not found" },
  FOLDER_EXISTS: { status: 409, message: "Folder already exists" },
  FOLDER_NOT_EMPTY: { status: 409, message: "Folder is not empty" },
  // client-only (never sent by the server)
  TOO_MANY_FILES: {
    status: 400,
    client: true,
    message: "At most {maxFiles} files can be added",
  },
  HOOK_FAILED: {
    status: 500,
    client: true,
    message: "The {hook} callback failed",
  },
  NETWORK_ERROR: { status: 502, client: true, message: "Network error" },
  UPLOAD_FAILED: {
    status: 502,
    client: true,
    message: "Upload failed with HTTP {status}",
  },
  DOWNLOAD_FAILED: {
    status: 502,
    client: true,
    message: "Download failed with HTTP {status}",
  },
  CHECKSUM_MISMATCH: {
    status: 400,
    client: true,
    message: "Uploaded bytes do not match the checksum",
  },
  PARTIAL_FAILURE: {
    status: 207,
    client: true,
    message: "{failed} of {total} operations failed",
  },
  UNKNOWN_ERROR: {
    status: 500,
    client: true,
    message: "Something went wrong",
  },
});

export type S3ErrorCode = keyof typeof S3_ERROR_CODES;

/** Codes only the browser raises (`client: true`). */
export type S3ClientErrorCode = {
  [K in S3ErrorCode]: (typeof S3_ERROR_CODES)[K] extends { client: true }
    ? K
    : never;
}[S3ErrorCode];

/** Codes the server sends on the wire. */
export type S3ServerErrorCode = Exclude<S3ErrorCode, S3ClientErrorCode>;

/** Typed `params` for each code whose message has placeholders. */
export interface S3ErrorParamsMap {
  VALIDATION_ERROR: { issue: string };
  REQUEST_TOO_LARGE: { maxSize: number };
  S3_NETWORK_ERROR: { code: string };
  UNKNOWN_ROUTE: { route: string };
  /** `proxy` is `/file` on a route whose downloads are not in proxy mode. */
  FEATURE_DISABLED: {
    feature: "upload" | "download" | "delete" | "multipart" | "proxy";
  };
  FILE_TOO_LARGE: { size: number; maxFileSize: number };
  /** `allowed` is the allow-list joined with `", "`. */
  FILE_TYPE_NOT_ALLOWED: { type: string; allowed: string };
  FILE_CONTENT_MISMATCH: { type: string; detected: string };
  QUOTA_EXCEEDED: { limit: "bytes" | "files" };
  UPLOAD_SIZE_MISMATCH: { expected: number; actual: number };
  MULTIPART_PART_MISSING: { partNumber: number };
  MULTIPART_PART_INVALID: { partNumber: number; partCount: number };
  TOO_MANY_FILES: { maxFiles: number };
  HOOK_FAILED: { hook: string };
  UPLOAD_FAILED: { status: number };
  DOWNLOAD_FAILED: { status: number };
  PARTIAL_FAILURE: { failed: number; total: number };
}

/** `params` for `C`, or `undefined` when its message has no placeholders. */
export type S3ErrorParams<C extends S3ErrorCode> =
  C extends keyof S3ErrorParamsMap ? S3ErrorParamsMap[C] : undefined;

/** Wire body of every error response; also `deleteMany.failed[].error`. */
export type S3ErrorShape<C extends S3ErrorCode = S3ErrorCode> = {
  code: C;
  message: string;
  params?: S3ErrorParams<C>;
};

/**
 * Fill `{name}` placeholders in `template` from `params`.
 * Placeholders without a matching param are left as they are.
 */
export function formatErrorMessage(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replaceAll(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}
