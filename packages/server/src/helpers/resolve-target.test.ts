import { describe, expect, it, vi } from "vitest";
import {
  assertSafeObjectKey,
  assertStoredKey,
  generateObjectKey,
  resolveStoredTarget,
  resolveUploadTarget,
} from "./resolve-target";
import { errors } from "@/errors";
import type { ObjectContext, ResolvedRoutePolicy } from "@/types";

const request = new Request("http://localhost");

function ctx(overrides: Partial<ObjectContext> = {}): ObjectContext {
  return {
    request,
    route: "uploads",
    file: { name: "a.png" },
    bucket: "bucket",
    keyPrefix: "uploads",
    ...overrides,
  };
}

function route(
  overrides: Partial<ResolvedRoutePolicy> = {},
): ResolvedRoutePolicy {
  return {
    name: "uploads",
    client: {} as ResolvedRoutePolicy["client"],
    bucket: "bucket",
    keyPrefix: "uploads",
    skippedPluginIds: new Set(),
    upload: { enabled: true },
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

describe("generateObjectKey", () => {
  it("prefixes a generated uuid/filename leaf", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(generateObjectKey("uploads", ctx())).toBe(
      "uploads/11111111-1111-1111-1111-111111111111/a.png",
    );
  });

  it("defaults to keyPrefix/uuid/filename when no prefix is set", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(generateObjectKey(undefined, ctx())).toBe(
      "uploads/11111111-1111-1111-1111-111111111111/a.png",
    );
  });

  it("nests a custom prefix under keyPrefix", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(generateObjectKey("media", ctx())).toBe(
      "uploads/media/11111111-1111-1111-1111-111111111111/a.png",
    );
  });
});

describe("resolveUploadTarget", () => {
  it("lets object.key win over object.prefix and nests under keyPrefix", async () => {
    await expect(
      resolveUploadTarget(
        route({
          upload: {
            enabled: true,
            object: ({ file }: ObjectContext) => ({
              prefix: "uploads",
              key: `users/1/${file.name}`,
            }),
          },
        }),
        ctx(),
      ),
    ).resolves.toMatchObject({
      key: "uploads/users/1/a.png",
      bucket: "bucket",
    });
  });

  it("uses object.prefix when key is omitted", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    await expect(
      resolveUploadTarget(
        route({
          upload: {
            enabled: true,
            object: () => ({
              prefix: "media",
              metadata: { author: "user_123" },
            }),
          },
        }),
        ctx(),
      ),
    ).resolves.toEqual({
      key: "uploads/media/11111111-1111-1111-1111-111111111111/a.png",
      bucket: "bucket",
      metadata: { author: "user_123" },
      acl: "private",
    });
  });

  it("does not double-prefix a key already under keyPrefix", async () => {
    await expect(
      resolveUploadTarget(
        route({
          upload: {
            enabled: true,
            object: () => ({ key: "uploads/stable.png" }),
          },
        }),
        ctx(),
      ),
    ).resolves.toMatchObject({ key: "uploads/stable.png" });
  });

  it("lets object override the route ACL", async () => {
    await expect(
      resolveUploadTarget(
        route({
          upload: {
            enabled: true,
            acl: "private",
            object: () => ({ key: "a.png", acl: "public-read" }),
          },
        }),
        ctx(),
      ),
    ).resolves.toMatchObject({
      key: "uploads/a.png",
      acl: "public-read",
    });
  });

  it("maps a plain Error from object() to FORBIDDEN", async () => {
    await expect(
      resolveUploadTarget(
        route({
          upload: {
            enabled: true,
            object: () => {
              throw new Error("not signed in");
            },
          },
        }),
        ctx(),
      ),
    ).rejects.toMatchObject({
      message: "not signed in",
      status: "FORBIDDEN",
      statusCode: 403,
    });
  });

  it("preserves DimahS3Error from object()", async () => {
    await expect(
      resolveUploadTarget(
        route({
          upload: {
            enabled: true,
            object: () => {
              throw errors.unauthorized();
            },
          },
        }),
        ctx(),
      ),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
  });
});

describe("assertStoredKey / resolveStoredTarget", () => {
  it("normalizes a safe stored key under the prefix", () => {
    expect(assertStoredKey("uploads/a.png", "uploads")).toBe("uploads/a.png");
  });

  it("rejects a key outside the route prefix", () => {
    expect(() => assertStoredKey("avatars/a.png", "uploads")).toThrow();
    expect(() => resolveStoredTarget(route(), "avatars/a.png")).toThrow();
  });

  it("allows any safe key when keyPrefix is false", () => {
    expect(assertStoredKey("avatars/a.png", false)).toBe("avatars/a.png");
    expect(resolveStoredTarget(route({ keyPrefix: false }), "a.png")).toEqual({
      key: "a.png",
      bucket: "bucket",
    });
  });
});
