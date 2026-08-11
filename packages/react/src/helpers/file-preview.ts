/** Create an object URL for image files; returns `null` for non-images. */
export function createImagePreviewUrl(file: File): string | null {
  if (!file.type.startsWith("image/")) return null;
  return URL.createObjectURL(file);
}

/** Revoke an object URL created by {@link createImagePreviewUrl}. */
export function revokePreviewUrl(url: string | null | undefined): void {
  if (!url) return;
  URL.revokeObjectURL(url);
}
