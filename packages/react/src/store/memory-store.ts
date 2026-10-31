import type { StoredUpload, UploadStore } from "@/types/upload-store";

/**
 * An in-memory `UploadStore`, safe for SSR. Records are lost on reload, so
 * uploads resume only within the page session. Useful for tests, or for
 * resuming without `localStorage`.
 *
 * @example
 * ```ts
 * const store = createMemoryStore();
 * useUpload({ api, route: "uploads", uploadStore: store });
 * ```
 */
export function createMemoryStore(): UploadStore {
  const uploads = new Map<string, StoredUpload>();

  return {
    get(resumeKey, fileSize) {
      const stored = uploads.get(resumeKey);
      return stored?.fileSize === fileSize ? stored : null;
    },

    set(upload) {
      uploads.set(upload.resumeKey, upload);
    },

    delete(resumeKey) {
      uploads.delete(resumeKey);
    },
  };
}
