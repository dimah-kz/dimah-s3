import { s3Error } from "@dimah-s3/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testUpload } from "@/test/harness";
import type {
  UploadObjectContext,
  UploadObjectInfo,
} from "@/types/hook-contexts";
import type { ResolvedRoute } from "@/types/resolved";
import {
  assertSafeObjectKey,
  assertStoredKey,
  generateObjectKey,
  nestKeyUnderPrefix,
  resolveUploadObject,
} from "./resolve-target";

const UUID = "11111111-1111-1111-1111-111111111111";

function context(
  overrides: Partial<UploadObjectContext> = {},
): UploadObjectContext {
  return {
    request: new Request("http://localhost"),
    operation: "upload",
    locals: Object.create(null),
    route: "uploads",
    file: { name: "a.png", size: 10, type: "image/png" },
    bucket: "bucket",
    keyPrefix: "uploads",
    ...overrides,
  };
}

function resolveWith(
  object: (() => UploadObjectInfo | void) | undefined,
  keyPrefix: ResolvedRoute["keyPrefix"] = "uploads",
) {
  return resolveUploadObject(
    { keyPrefix, upload: testUpload({ object }) },
    context({ keyPrefix }),
  );
}

beforeEach(() => {
  vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assertSafeObjectKey", () => {
  it("strips surrounding slashes", () => {
    expect(assertSafeObjectKey("/a/b.png/")).toBe("a/b.png");
  });

  it.each(["../secret", "a/../b", "a//b", "a\\b", "a\0b", ""])(
    "rejects %j with KEY_INVALID",
    (key) => {
      expect(() => assertSafeObjectKey(key)).toThrow(
        expect.objectContaining({ code: "KEY_INVALID", statusCode: 400 }),
      );
    },
  );
});

describe("nestKeyUnderPrefix", () => {
  it("nests a key once", () => {
    expect(nestKeyUnderPrefix("uploads", "a.png")).toBe("uploads/a.png");
    expect(nestKeyUnderPrefix("uploads", "uploads/a.png")).toBe(
      "uploads/a.png",
    );
  });

  it("rejects the prefix itself", () => {
    expect(() => nestKeyUnderPrefix("uploads", "uploads")).toThrow(
      expect.objectContaining({ code: "KEY_INVALID" }),
    );
  });

  it("rejects a nested key over 1024 UTF-8 bytes", () => {
    const key = "é".repeat(508); // 1016 bytes
    expect(nestKeyUnderPrefix("abc", key)).toBe(`abc/${key}`);
    expect(() => nestKeyUnderPrefix("user-uploads", key)).toThrow(
      expect.objectContaining({ code: "KEY_INVALID" }),
    );
  });

  it("leaves a safe key alone without a prefix", () => {
    expect(nestKeyUnderPrefix(false, "/a.png")).toBe("a.png");
  });
});

describe("generateObjectKey", () => {
  it("joins a folder with a uuid/name leaf", () => {
    expect(generateObjectKey("uploads", "a.png")).toBe(`uploads/${UUID}/a.png`);
  });

  it("strips path segments from the name", () => {
    expect(generateObjectKey("uploads", "../secret.png")).toBe(
      `uploads/${UUID}/secret.png`,
    );
    expect(generateObjectKey("uploads", "foo/bar.png")).toBe(
      `uploads/${UUID}/bar.png`,
    );
  });

  it("omits the folder when it is false", () => {
    expect(generateObjectKey(false, "a.png")).toBe(`${UUID}/a.png`);
  });
});

describe("assertStoredKey", () => {
  it("accepts a key under the prefix", () => {
    expect(assertStoredKey("uploads/a.png", "uploads")).toBe("uploads/a.png");
  });

  it.each(["avatars/a.png", "uploads", "uploads-other/a.png"])(
    "rejects %j outside the prefix",
    (key) => {
      expect(() => assertStoredKey(key, "uploads")).toThrow(
        expect.objectContaining({ code: "KEY_INVALID" }),
      );
    },
  );

  it("accepts any safe key without a prefix", () => {
    expect(assertStoredKey("avatars/a.png", false)).toBe("avatars/a.png");
  });
});

describe("resolveUploadObject", () => {
  it("defaults to keyPrefix/uuid/name with the route ACL", async () => {
    await expect(resolveWith(undefined)).resolves.toEqual({
      key: `uploads/${UUID}/a.png`,
      bucket: "bucket",
      acl: "private",
    });
  });

  it("passes the upload context to object()", async () => {
    const object = vi.fn(() => undefined);
    const ctx = context({ clientMetadata: { folder: "docs" } });
    await resolveUploadObject(
      { keyPrefix: "uploads", upload: testUpload({ object }) },
      ctx,
    );
    expect(object).toHaveBeenCalledWith(ctx);
  });

  it("lets key win over keyFolder and nests it under keyPrefix", async () => {
    await expect(
      resolveWith(() => ({ keyFolder: "media", key: "users/1/a.png" })),
    ).resolves.toMatchObject({ key: "uploads/users/1/a.png" });
  });

  it("does not nest a key already under keyPrefix twice", async () => {
    await expect(
      resolveWith(() => ({ key: "uploads/stable.png" })),
    ).resolves.toMatchObject({ key: "uploads/stable.png" });
  });

  it("rejects a key equal to keyPrefix", async () => {
    await expect(resolveWith(() => ({ key: "uploads" }))).rejects.toMatchObject(
      { code: "KEY_INVALID" },
    );
  });

  it("puts keyFolder under keyPrefix", async () => {
    await expect(
      resolveWith(() => ({ keyFolder: "media" })),
    ).resolves.toMatchObject({ key: `uploads/media/${UUID}/a.png` });
  });

  it("uses keyFolder alone when keyPrefix is false", async () => {
    await expect(
      resolveWith(() => ({ keyFolder: "media" }), false),
    ).resolves.toMatchObject({ key: `media/${UUID}/a.png` });
    await expect(resolveWith(undefined, false)).resolves.toMatchObject({
      key: `${UUID}/a.png`,
    });
  });

  it("returns metadata, ACL and S3 headers from object()", async () => {
    await expect(
      resolveWith(() => ({
        key: "a.png",
        acl: "public-read",
        metadata: { author: "José" },
        storageClass: "STANDARD_IA",
        cacheControl: "max-age=60",
        tagging: { env: "test" },
      })),
    ).resolves.toEqual({
      key: "uploads/a.png",
      bucket: "bucket",
      acl: "public-read",
      metadata: { author: "José" },
      storageClass: "STANDARD_IA",
      cacheControl: "max-age=60",
      tagging: { env: "test" },
    });
  });

  it("drops blank S3 headers and empty tagging", async () => {
    const target = await resolveWith(() => ({
      key: "a.png",
      storageClass: "  ",
      tagging: {},
    }));
    expect(target).not.toHaveProperty("storageClass");
    expect(target).not.toHaveProperty("tagging");
  });

  it("rejects more than 10 tags as a config error", async () => {
    await expect(
      resolveWith(() => ({
        key: "a.png",
        tagging: Object.fromEntries(
          Array.from({ length: 11 }, (_, i) => [`k${i}`, "v"]),
        ),
      })),
    ).rejects.toMatchObject({ name: "ConfigError" });
  });

  it("nests previousKey under keyPrefix", async () => {
    await expect(
      resolveWith(() => ({ key: "new.png", previousKey: "old.png" })),
    ).resolves.toMatchObject({ previousKey: "uploads/old.png" });
    await expect(
      resolveWith(() => ({ previousKey: "../escape" })),
    ).rejects.toMatchObject({ code: "KEY_INVALID" });
  });

  it("lets errors from object() through unchanged", async () => {
    const plain = new Error("database down");
    await expect(
      resolveWith(() => {
        throw plain;
      }),
    ).rejects.toBe(plain);

    const forbidden = s3Error("FORBIDDEN");
    await expect(
      resolveWith(() => {
        throw forbidden;
      }),
    ).rejects.toBe(forbidden);
  });
});
