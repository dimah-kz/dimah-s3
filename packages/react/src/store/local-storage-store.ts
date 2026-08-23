import type { StoredUpload, UploadStore } from "@/types/upload-store";

const STORAGE_PREFIX = "dimah-s3:upload:";

/**
 * Default `UploadStore` implementation backed by `localStorage`.
 * Stores one pending upload per S3 object key.
 *
 * Falls back silently when `localStorage` is unavailable (SSR, private
 * browsing with full quota, or environments without a `window` object).
 */
export function createLocalStorageStore(): UploadStore {
  return {
    get(key, fileSize) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        if (!raw) return null;
        const stored = JSON.parse(raw) as StoredUpload;
        // Reject if the stored size doesn't match — different file for the same key.
        return stored.fileSize === fileSize ? stored : null;
      } catch {
        return null;
      }
    },

    set(upload) {
      try {
        localStorage.setItem(
          STORAGE_PREFIX + upload.key,
          JSON.stringify(upload),
        );
      } catch {
        // localStorage unavailable (SSR, quota exceeded) — silently skip.
      }
    },

    delete(key) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + key);
      } catch {
        // ignore
      }
    },
  };
}
