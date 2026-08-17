/** Default mount path for the catch-all route (`app/api/s3/[...s3]/route.ts`). */
export const S3_API_BASE_PATH = "/api/s3";

export function normalizeS3ApiBasePath(basePath: string): string {
  return basePath.replace(/\/$/, "");
}

/** Relative paths under {@link S3_API_BASE_PATH}. Always start with `/`. */
export const S3_API_ROUTES = {
  upload: "/presign/upload",
  uploadConfirm: "/presign/upload/confirm",
  download: "/presign/download",
  delete: "/delete",
  multipartInit: "/presign/multipart/init",
  multipartPart: "/presign/multipart/part",
  multipartComplete: "/presign/multipart/complete",
  multipartAbort: "/presign/multipart/abort",
  multipartListParts: "/presign/multipart/parts",
} as const;
