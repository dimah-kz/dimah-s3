import {
  buildContentDisposition,
  resolveInlineDisposition,
  resolveStoredFileName,
  type ContentDispositionType,
} from "@dimah-s3/core";
import type { ResolvedDownload } from "@/types/resolved";

/** How a stored object is sent: the presigned GET or the `/file` response. */
export type ObjectDisposition = {
  disposition: ContentDispositionType;
  /** `Content-Disposition` value, with the file name when there is one. */
  header: string;
  /**
   * Set when the object opens inline but has no usable stored type: the
   * type matched from the file name. Send it as `Content-Type`.
   */
  contentType?: string;
};

/**
 * The disposition for a stored object, after S3 reports its type. `inline`
 * is kept only when the type is on the route's effective `inlineTypes`;
 * anything else is sent as `attachment`. Without a requested `name`, the
 * file name comes from the stored `Content-Disposition`, else the key.
 */
export function resolveObjectDisposition(
  inlineTypes: ResolvedDownload["inlineTypes"],
  input: {
    key: string;
    name?: string;
    requested: ContentDispositionType;
    /** Stored `Content-Type`, as S3 reports it. */
    contentType?: string;
    /** Stored `Content-Disposition`, as S3 reports it. */
    contentDisposition?: string;
  },
): ObjectDisposition {
  const name =
    input.name ?? resolveStoredFileName(input.contentDisposition, input.key);
  const resolved = resolveInlineDisposition({
    contentType: input.contentType,
    fileName: name,
    allow: inlineTypes,
    requested: input.requested,
  });
  return {
    ...resolved,
    header: name
      ? buildContentDisposition(name, resolved.disposition)
      : resolved.disposition,
  };
}
