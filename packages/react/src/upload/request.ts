import type { UploadRequestInput, UploadRequestOptions } from "@/types/upload";

/**
 * `override` over `base`, the way `useUpload` puts a call's `uploadOptions`
 * over the hook's: `override` fields win, and `metadata` merges key by key.
 */
export function mergeUploadRequest(
  base: UploadRequestOptions | undefined,
  override: UploadRequestOptions | undefined,
): UploadRequestOptions {
  if (!base || !override) return override ?? base ?? {};
  const merged = { ...base, ...override };
  if (base.metadata && override.metadata) {
    merged.metadata = { ...base.metadata, ...override.metadata };
  }
  return merged;
}

/** The request options `input` gives for `file`. */
export function resolveUploadRequest(
  input: UploadRequestInput | undefined,
  file: File,
): UploadRequestOptions | undefined {
  return typeof input === "function" ? input(file) : input;
}
