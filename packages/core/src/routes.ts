import { stripTrailingSlashes } from "./helpers/strip-slashes";

/** Default mount path for the catch-all route (`app/api/s3/[...s3]/route.ts`). */
export const S3_API_BASE_PATH = "/api/s3";

export function normalizeS3ApiBasePath(basePath: string): string {
  return stripTrailingSlashes(basePath);
}

/** Relative paths under {@link S3_API_BASE_PATH}. Always start with `/`. */
export const S3_API_ROUTES = {
  upload: "/presign/upload",
  confirm: "/presign/upload/confirm",
  download: "/presign/download",
  file: "/file",
  catalog: "/routes",
  delete: "/delete",
  deleteMany: "/delete/batch",
  multipartInit: "/presign/multipart/init",
  multipartSignPart: "/presign/multipart/part",
  /** `POST`, because the body carries the upload ticket. */
  multipartListParts: "/presign/multipart/parts",
  multipartComplete: "/presign/multipart/complete",
  multipartAbort: "/presign/multipart/abort",
} as const;
