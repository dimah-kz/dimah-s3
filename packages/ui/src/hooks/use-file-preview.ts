"use client";

import { useCallback, useSyncExternalStore } from "react";

/** One object URL per image file, shared by every component that shows it. */
type Preview = {
  url: string;
  users: number;
  revokeTimer?: ReturnType<typeof setTimeout>;
};

const previews = new WeakMap<File, Preview>();

function previewOf(file: File): Preview | null {
  if (
    !file.type.startsWith("image/") ||
    typeof URL.createObjectURL !== "function"
  ) {
    return null;
  }
  let preview = previews.get(file);
  if (!preview) {
    preview = { url: URL.createObjectURL(file), users: 0 };
    previews.set(file, preview);
  }
  return preview;
}

const noop = () => {};

/**
 * Object URL of an image `file` for a thumbnail, or `null` for other files
 * and while `file` is `null`. The URL is revoked once no mounted component
 * uses it, a tick later, so a remount (as under StrictMode) keeps it.
 */
export function useFilePreview(file: File | null): string | null {
  const subscribe = useCallback(() => {
    const preview = file ? previewOf(file) : null;
    if (!file || !preview) return noop;
    preview.users += 1;
    clearTimeout(preview.revokeTimer);
    return () => {
      preview.users -= 1;
      preview.revokeTimer = setTimeout(() => {
        if (preview.users > 0) return;
        URL.revokeObjectURL(preview.url);
        previews.delete(file);
      });
    };
  }, [file]);

  return useSyncExternalStore(
    subscribe,
    () => (file ? (previewOf(file)?.url ?? null) : null),
    () => null,
  );
}
