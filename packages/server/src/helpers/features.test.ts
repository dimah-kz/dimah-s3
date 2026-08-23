import { describe, expect, it } from "vitest";
import {
  applyMultipartDefault,
  assertExclusiveBucketFlags,
  normalizeFeature,
} from "./features";
import type { ResolvedDimahS3Config } from "../types";

function config(
  overrides: Partial<ResolvedDimahS3Config> = {},
): ResolvedDimahS3Config {
  return {
    client: {} as ResolvedDimahS3Config["client"],
    bucket: "bucket",
    ...overrides,
  };
}

describe("normalizeFeature / multipart default", () => {
  it("treats a bare true as enabled", () => {
    expect(normalizeFeature(true)).toEqual({ enabled: true });
  });

  it("enables multipart when upload is on and multipart is omitted", () => {
    const resolved = applyMultipartDefault(
      config({ upload: { enabled: true } }),
      undefined,
    );
    expect(resolved.multipart?.enabled).toBe(true);
  });

  it("does not enable multipart when explicitly false", () => {
    const resolved = applyMultipartDefault(
      config({
        upload: { enabled: true },
        multipart: { enabled: false },
      }),
      false,
    );
    expect(resolved.multipart?.enabled).toBe(false);
  });

  it("inherits upload ACL policy onto multipart", () => {
    const resolved = applyMultipartDefault(
      config({
        upload: {
          enabled: true,
          acl: "public-read",
          allowClientAcl: true,
          prefix: "uploads",
          requireFileSize: true,
        },
        multipart: { enabled: true },
      }),
      true,
    );
    expect(resolved.multipart?.acl).toBe("public-read");
    expect(resolved.multipart?.allowClientAcl).toBe(true);
    expect(resolved.multipart?.prefix).toBe("uploads");
    expect(resolved.multipart?.requireFileSize).toBe(true);
  });
});

describe("assertExclusiveBucketFlags", () => {
  it("rejects allowClientBucket together with buckets", () => {
    expect(() =>
      assertExclusiveBucketFlags({
        allowClientBucket: true,
        buckets: ["bucket"],
      }),
    ).toThrow(/allowClientBucket or buckets/);
  });

  it("allows either flag alone", () => {
    expect(() =>
      assertExclusiveBucketFlags({ allowClientBucket: true }),
    ).not.toThrow();
    expect(() =>
      assertExclusiveBucketFlags({ buckets: ["bucket"] }),
    ).not.toThrow();
  });
});
