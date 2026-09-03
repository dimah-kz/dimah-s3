import type { StoredUpload, UploadStore } from "@/types/upload-store";

const STORAGE_PREFIX = "dimah-s3:upload:";

/**
 * Default `UploadStore` implementation backed by `localStorage`.
 * Stores one pending upload per resume identity (`route:name:size:mtime`).
 *
 * Falls back silently when `localStorage` is unavailable (SSR, private
 * browsing with full quota, or environments without a `window` object).
 */
export function createLocalStorageStore(): UploadStore {
  return {
    get(resumeKey, fileSize) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + resumeKey);
        if (!raw) return null;
        const stored = JSON.parse(raw) as StoredUpload;
        if (
          stored.resumeKey !== resumeKey ||
          stored.fileSize !== fileSize ||
          !stored.uploadId ||
          !stored.key
        ) {
          return null;
        }
        return stored;
      } catch {
        return null;
      }
    },

    set(upload) {
      try {
        localStorage.setItem(
          STORAGE_PREFIX + upload.resumeKey,
          JSON.stringify(upload),
        );
      } catch {
        // localStorage unavailable (SSR, quota exceeded) — silently skip.
      }
    },

    delete(resumeKey) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + resumeKey);
      } catch {
        // ignore
      }
    },
  };
}
