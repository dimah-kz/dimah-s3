/** Files at least this large use multipart when the route allows it. */
export const DEFAULT_MULTIPART_THRESHOLD = 50 * 1024 * 1024; // 50 MiB
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY = 1_000; // ms
export const DEFAULT_CONCURRENT_PARTS = 4;
export const DEFAULT_CONCURRENT_FILES = 2;
/** Default max files per selection: one file. */
export const DEFAULT_MAX_FILES = 1;
/**
 * A presigned URL counts as expired this long before its `expiresIn` ends,
 * to allow for clock skew between the app server and S3.
 */
export const URL_EXPIRY_MARGIN_MS = 30_000;
