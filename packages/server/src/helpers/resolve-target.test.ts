import { describe, expect, it } from "vitest";
import { S3_ERROR_CODES } from "@dimah-s3/core";
import {
  assertSafeObjectKey,
  resolveBucket,
  resolveObjectKey,
} from "./resolve-target";
import type { ResolvedDimahS3Config } from "@/types";

const request = new Request("http://localhost");

function config(
  overrides: Partial<ResolvedDimahS3Config> = {},
): ResolvedDimahS3Config {
  return {
    client: {} as ResolvedDimahS3Config["client"],
    bucket: "bucket",
    ...overrides,
  };
}

describe("assertSafeObjectKey", () => {
  it("strips leading slashes", () => {
    expect(assertSafeObjectKey("/a/b.png")).toBe("a/b.png");
  });

  it("rejects parent segments", () => {
    expect(() => assertSafeObjectKey("../secret")).toThrow();
    expect(() => assertSafeObjectKey("a/../b")).toThrow();
  });
});

describe("resolveObjectKey", () => {
  it("applies a string prefix unless the key is already prefixed", async () => {
    const ctx = {
      request,
      proposedKey: "a.png",
      bucket: "bucket",
    };
    await expect(resolveObjectKey({ prefix: "uploads" }, ctx)).resolves.toBe(
      "uploads/a.png",
    );
    await expect(
      resolveObjectKey(
        { prefix: "uploads" },
        {
          ...ctx,
          proposedKey: "uploads/a.png",
        },
      ),
    ).resolves.toBe("uploads/a.png");
  });

  it("lets resolveKey win over prefix", async () => {
    await expect(
      resolveObjectKey(
        {
          prefix: "uploads",
          resolveKey: ({ proposedKey }) => `users/1/${proposedKey}`,
        },
        { request, proposedKey: "a.png", bucket: "bucket" },
      ),
    ).resolves.toBe("users/1/a.png");
  });
});

describe("resolveBucket", () => {
  it("ignores a client bucket by default", () => {
    expect(resolveBucket(config(), "other")).toBe("bucket");
  });

  it("allows any bucket when allowClientBucket is set", () => {
    expect(resolveBucket(config({ allowClientBucket: true }), "other")).toBe(
      "other",
    );
  });

  it("rejects buckets outside the allowlist", () => {
    try {
      resolveBucket(config({ buckets: ["bucket"] }), "other");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toMatchObject({ code: S3_ERROR_CODES.INVALID_BUCKET.code });
    }
  });
});
