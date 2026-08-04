import { dimahS3 } from "@dimah-s3/server";
import { s3Client, defaultBucket } from "@/lib/s3-client";

export const s3 = dimahS3({
  s3: s3Client,

  defaultBucket: defaultBucket,
  resolveObjectAcl: true,
  // Add auth in production — verify session/JWT before presigning.
  guard: async () => {},

  upload: {
    method: "POST",
    enabled: true,
    onPresigned: async ({ key, bucket, contentType }) => {
      console.log(`[upload] presigned: ${key} (${contentType}) in ${bucket}`);
    },
    onConfirmed: async ({ key, contentType, contentLength, eTag }) => {
      console.log(
        `[upload] confirmed: ${key} — ${contentType}, ${contentLength} bytes, eTag: ${eTag}`,
      );
    },
  },

  multipart: {
    enabled: true,
    onInit: async ({ key, uploadId }) => {
      console.log(`[multipart] init: ${key} (uploadId: ${uploadId})`);
    },
    onComplete: async ({ key, uploadId, contentLength, contentType, eTag }) => {
      console.log(
        `[multipart] complete: ${key} (uploadId: ${uploadId}) — ${contentType}, ${contentLength} bytes, eTag: ${eTag}`,
      );
    },
    onAbort: async ({ key, uploadId }) => {
      console.log(`[multipart] abort: ${key} (uploadId: ${uploadId})`);
    },
    /**
     * listGuard — runs before ListParts (called by the resumable upload flow).
     * Enforce the same auth check you use on init/complete.
     */
    listGuard: async ({ request: _request, key, uploadId }) => {
      console.log(`[multipart] listParts: ${key} (uploadId: ${uploadId})`);
    },
  },

  download: {
    enabled: true,
  },

  delete: {
    enabled: true,
    onDeleted: async ({ key, bucket }) => {
      console.log(`[delete] ${key} from ${bucket}`);
    },
  },
});
