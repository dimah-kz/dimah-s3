import type { StoredUpload, UploadStore } from "@/types/upload-store";

/**
 * In-memory `UploadStore` — safe for SSR and server-component environments.
 *
 * State is cleared on page reload. Useful as a fallback, for testing, or
 * when you want session-scoped resume without touching `localStorage`.
 *
 * @example
 * ```ts
 * const store = createMemoryStore();
 * useUpload({ api, route: "uploads", uploadStore: store });
 * ```
 */
export function createMemoryStore(): UploadStore {
  const map = new Map<string, StoredUpload>();

  return {
    get(resumeKey, fileSize) {
      const stored = map.get(resumeKey);
      if (!stored) return null;
      return stored.fileSize === fileSize ? stored : null;
    },

    set(upload) {
      map.set(upload.resumeKey, upload);
    },

    delete(resumeKey) {
      map.delete(resumeKey);
    },
  };
}
