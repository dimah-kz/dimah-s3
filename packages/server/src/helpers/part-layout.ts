import {
  S3_DEFAULT_PART_SIZE,
  S3_MAX_OBJECT_SIZE,
  S3_MAX_PART_NUMBER,
  S3_MAX_PART_SIZE,
  S3_MIN_PART_SIZE,
  s3Error,
} from "@dimah-s3/core";

const MIB = 1024 * 1024;

/** How a multipart upload is split. Every part but the last has `partSize` bytes. */
export type PartLayout = {
  /** Total object size in bytes. */
  size: number;
  partSize: number;
  partCount: number;
};

/**
 * The server-chosen part layout for an object of `size` bytes. The part size
 * starts at `preferred` (8 MiB by default), grows so the upload needs at most
 * 10,000 parts, is rounded up to a whole MiB, and stays within S3's part
 * limits. Over 5 TiB fails with `FILE_TOO_LARGE`.
 */
export function partLayout(size: number, preferred?: number): PartLayout {
  if (size > S3_MAX_OBJECT_SIZE) {
    throw s3Error("FILE_TOO_LARGE", {
      size,
      maxFileSize: S3_MAX_OBJECT_SIZE,
    });
  }
  const wanted = Math.max(
    preferred ?? S3_DEFAULT_PART_SIZE,
    Math.ceil(size / S3_MAX_PART_NUMBER),
  );
  const partSize = Math.min(
    Math.max(Math.ceil(wanted / MIB) * MIB, S3_MIN_PART_SIZE),
    S3_MAX_PART_SIZE,
  );
  return { size, partSize, partCount: Math.ceil(size / partSize) };
}

/** Byte size of part `partNumber` (1-based). The last part holds the rest. */
export function partByteSize(layout: PartLayout, partNumber: number): number {
  return partNumber < layout.partCount
    ? layout.partSize
    : layout.size - layout.partSize * (layout.partCount - 1);
}

/** Fails with `MULTIPART_PART_INVALID` unless `1 ≤ partNumber ≤ partCount`. */
export function assertPartNumber(layout: PartLayout, partNumber: number): void {
  if (
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > layout.partCount
  ) {
    throw s3Error("MULTIPART_PART_INVALID", {
      partNumber,
      partCount: layout.partCount,
    });
  }
}
