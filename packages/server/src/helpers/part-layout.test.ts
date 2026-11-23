import {
  S3_DEFAULT_PART_SIZE,
  S3_MAX_OBJECT_SIZE,
  S3_MAX_PART_NUMBER,
  S3_MAX_PART_SIZE,
  S3_MIN_PART_SIZE,
} from "@dimah-s3/core";
import { describe, expect, it } from "vitest";
import { assertPartNumber, partByteSize, partLayout } from "./part-layout";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

describe("partLayout", () => {
  it("uses 8 MiB parts by default", () => {
    expect(partLayout(20 * MIB)).toEqual({
      size: 20 * MIB,
      partSize: S3_DEFAULT_PART_SIZE,
      partCount: 3,
    });
  });

  it("uses one part for a small file", () => {
    expect(partLayout(1)).toEqual({
      size: 1,
      partSize: S3_DEFAULT_PART_SIZE,
      partCount: 1,
    });
  });

  it("uses the preferred part size", () => {
    expect(partLayout(100 * MIB, 16 * MIB)).toMatchObject({
      partSize: 16 * MIB,
      partCount: 7,
    });
  });

  it("raises a preferred size below the S3 minimum", () => {
    expect(partLayout(100 * MIB, 1024).partSize).toBe(S3_MIN_PART_SIZE);
  });

  it("rounds the part size up to a whole MiB", () => {
    expect(partLayout(100 * MIB, 6 * MIB + 1).partSize).toBe(7 * MIB);
  });

  it("caps the preferred size at the S3 maximum", () => {
    expect(partLayout(10 * GIB, 6 * GIB)).toMatchObject({
      partSize: S3_MAX_PART_SIZE,
      partCount: 2,
    });
  });

  it("grows the part size so the upload needs at most 10,000 parts", () => {
    const size = 100 * GIB;
    const layout = partLayout(size);

    expect(layout.partSize).toBe(11 * MIB);
    expect(layout.partSize % MIB).toBe(0);
    expect(layout.partCount).toBeLessThanOrEqual(S3_MAX_PART_NUMBER);
    expect(layout.partSize * layout.partCount).toBeGreaterThanOrEqual(size);
  });

  it("fits a 5 TiB object in 10,000 parts", () => {
    const layout = partLayout(S3_MAX_OBJECT_SIZE);

    expect(layout.partSize).toBe(525 * MIB);
    expect(layout.partCount).toBeLessThanOrEqual(S3_MAX_PART_NUMBER);
  });

  it("rejects an object over 5 TiB", () => {
    expect(() => partLayout(S3_MAX_OBJECT_SIZE + 1)).toThrow(
      expect.objectContaining({
        code: "FILE_TOO_LARGE",
        statusCode: 413,
        params: {
          size: S3_MAX_OBJECT_SIZE + 1,
          maxFileSize: S3_MAX_OBJECT_SIZE,
        },
      }),
    );
  });
});

describe("partByteSize", () => {
  const layout = partLayout(20 * MIB + 5);

  it("gives every part but the last the part size", () => {
    expect(layout.partCount).toBe(3);
    expect(partByteSize(layout, 1)).toBe(8 * MIB);
    expect(partByteSize(layout, 2)).toBe(8 * MIB);
  });

  it("gives the last part the rest", () => {
    expect(partByteSize(layout, 3)).toBe(4 * MIB + 5);
  });

  it("sums to the object size", () => {
    let total = 0;
    for (let n = 1; n <= layout.partCount; n++) {
      total += partByteSize(layout, n);
    }
    expect(total).toBe(layout.size);
  });

  it("gives a single part the whole object", () => {
    expect(partByteSize(partLayout(10), 1)).toBe(10);
  });
});

describe("assertPartNumber", () => {
  const layout = partLayout(20 * MIB);

  it("accepts 1..partCount", () => {
    expect(() => assertPartNumber(layout, 1)).not.toThrow();
    expect(() => assertPartNumber(layout, 3)).not.toThrow();
  });

  it.each([0, 4, 1.5])("rejects part %s", (partNumber) => {
    expect(() => assertPartNumber(layout, partNumber)).toThrow(
      expect.objectContaining({
        code: "MULTIPART_PART_INVALID",
        params: { partNumber, partCount: 3 },
      }),
    );
  });
});
