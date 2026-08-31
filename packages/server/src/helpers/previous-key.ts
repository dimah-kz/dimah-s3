/** S3 user-metadata key for `upload.object().previousKey`. */
export const DIMAH_PREVIOUS_KEY_META = "dimah-previous-key";

export function stripPreviousKeyMeta(
  metadata: Record<string, string> | undefined,
): Record<string, string> {
  if (!metadata) return {};
  const { [DIMAH_PREVIOUS_KEY_META]: _omit, ...rest } = metadata;
  return rest;
}

export function previousKeyFromMetadata(
  metadata: Record<string, string> | undefined,
): string | undefined {
  const value = metadata?.[DIMAH_PREVIOUS_KEY_META]?.trim();
  return value || undefined;
}
