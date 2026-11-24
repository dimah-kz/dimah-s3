/*
 * How client inputs become requests. `shareClient()` and `s3.share.api`
 * share it, so the two never send different shapes. It imports types only.
 */
import type { ShareListLinksInput, ShareListSharedInput } from "@/types/client";

/** `GET /share/links` query: the target filter is flat on the wire. */
export function listLinksQuery(input: ShareListLinksInput = {}) {
  const { target, ...rest } = input;
  if (target === undefined) return rest;
  return target.type === "object"
    ? {
        ...rest,
        key: target.key,
        ...(target.bucket !== undefined && { bucket: target.bucket }),
      }
    : { ...rest, folderId: target.folderId };
}

/** `GET /share/items` query: the top of the share is `""` on the wire. */
export function listSharedQuery(input: ShareListSharedInput) {
  const { folderId, ...rest } = input;
  if (folderId === undefined) return rest;
  return { ...rest, folderId: folderId ?? "" };
}
