/**
 * Pair each stable API `code` with its English `message`.
 * Same shape as Better Auth `defineErrorCodes`.
 */
export function defineErrorCodes<const T extends Record<string, string>>(
  messages: T,
): { readonly [K in keyof T]: { readonly code: K; readonly message: T[K] } } {
  const codes = {} as {
    [K in keyof T]: { readonly code: K; readonly message: T[K] };
  };
  for (const code of Object.keys(messages) as (keyof T)[]) {
    codes[code] = { code, message: messages[code] };
  }
  return codes;
}

/**
 * Domain error catalog. Zod failures share {@link S3_ERROR_CODES.VALIDATION_ERROR};
 * HTTP 404 for unknown routes uses {@link S3_ERROR_CODES.NOT_FOUND}.
 */
export const S3_ERROR_CODES = defineErrorCodes({
  NOT_FOUND: "Not Found",
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Forbidden",
  CONFLICT: "Conflict",
  INTERNAL_ERROR: "Internal server error",
  OBJECT_NOT_FOUND: "Object not found",
  FEATURE_DISABLED: "{feature} is disabled",
  INVALID_KEY: "Object key is invalid",
  INVALID_BUCKET: "Bucket is not allowed",
  S3_NETWORK_ERROR:
    "S3 endpoint unreachable ({code}): check your endpoint URL and network connectivity",
  FILE_SIZE_REQUIRED_UPLOAD:
    "fileSize is required when upload.requireFileSize is enabled",
  FILE_SIZE_REQUIRED_MULTIPART:
    "fileSize is required when multipart.requireFileSize is enabled",
  MULTIPART_PART_MISSING: "Uploaded part {partNumber} was not found",
  PAYLOAD_TOO_LARGE: "Payload too large",
  VALIDATION_ERROR: "Validation Error",
});

export type S3ErrorCode = keyof typeof S3_ERROR_CODES;
