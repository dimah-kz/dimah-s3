import { isStoredUpload } from "@/upload/stored-upload";
import type { UploadStore } from "@/types/upload-store";

const STORAGE_PREFIX = "dimah-s3:upload:";

/**
 * An `UploadStore` backed by `localStorage`, with one pending upload per
 * resume identity (`multipartResumeKey`). A record with an unknown shape,
 * such as one written by 1.x, is ignored and deleted.
 *
 * Does nothing when `localStorage` is unavailable (SSR, private browsing, or
 * a full quota).
 */
export function createLocalStorageStore(): UploadStore {
  return {
    get(resumeKey, fileSize) {
      try {
        const storageKey = STORAGE_PREFIX + resumeKey;
        const raw = localStorage.getItem(storageKey);
        if (raw === null) return null;
        const stored = parseJson(raw);
        if (!isStoredUpload(stored) || stored.resumeKey !== resumeKey) {
          localStorage.removeItem(storageKey);
          return null;
        }
        return stored.fileSize === fileSize ? stored : null;
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
        // localStorage is unavailable or full.
      }
    },

    delete(resumeKey) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + resumeKey);
      } catch {
        // localStorage is unavailable.
      }
    },
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
