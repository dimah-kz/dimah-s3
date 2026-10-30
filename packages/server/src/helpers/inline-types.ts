import {
  fileNameFromKey,
  resolveInlineDisposition,
  type ContentDispositionType,
  type ResolveInlineDispositionResult,
} from "@dimah-s3/core";

/**
 * Route `download.inlineTypes` after HeadObject. Without a list, the
 * disposition is signed as is.
 */
export function applyInlineTypes(
  inlineTypes: readonly string[] | undefined,
  input: {
    key: string;
    fileName?: string;
    disposition: ContentDispositionType;
    contentType?: string;
  },
): ResolveInlineDispositionResult {
  if (!inlineTypes) return { disposition: input.disposition };
  return resolveInlineDisposition({
    contentType: input.contentType,
    fileName: input.fileName ?? fileNameFromKey(input.key),
    allow: inlineTypes,
    requested: input.disposition,
  });
}
