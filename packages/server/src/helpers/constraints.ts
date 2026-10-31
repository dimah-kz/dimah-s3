import { matchesFileTypes, s3Error } from "@dimah-s3/core";
import type { UploadFile } from "@/types/hook-contexts";
import type { ResolvedUpload } from "@/types/resolved";

/** File limits from `upload` (`fileTypes` / `maxFileSize`). */
export type FileConstraints = Pick<ResolvedUpload, "fileTypes" | "maxFileSize">;

/** Fails with `FILE_TOO_LARGE` when `size` is over `maxFileSize`, if one is set. */
export function assertWithinMaxFileSize(
  maxFileSize: number | undefined,
  size: number,
): void {
  if (maxFileSize !== undefined && size > maxFileSize) {
    throw s3Error("FILE_TOO_LARGE", { size, maxFileSize });
  }
}

/**
 * Checks a file against the route limits: `FILE_TYPE_NOT_ALLOWED` when it
 * matches none of `fileTypes`, `FILE_TOO_LARGE` when it is over
 * `maxFileSize`. Runs on the declared file at presign, and again on the
 * HeadObject values at confirm.
 */
export function assertFileConstraints(
  constraints: FileConstraints,
  file: Pick<UploadFile, "size" | "type"> & { name?: string },
): void {
  const { fileTypes, maxFileSize } = constraints;
  const name = file.name ?? "";
  if (fileTypes?.length && !matchesFileTypes(name, file.type, fileTypes)) {
    throw s3Error("FILE_TYPE_NOT_ALLOWED", {
      type: describeFileType(name, file.type),
      allowed: fileTypes.join(", "),
    });
  }
  assertWithinMaxFileSize(maxFileSize, file.size);
}

/** The extension (`.exe`), else the MIME type, else `unknown`. Matches the browser check. */
function describeFileType(name: string, type: string | undefined): string {
  const dot = name.lastIndexOf(".");
  if (dot >= 0 && dot < name.length - 1) return name.slice(dot);
  return type || "unknown";
}
