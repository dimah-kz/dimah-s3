import { describe, expect, it, vi } from "vitest";
import {
  assertSafeObjectKey,
  assertStoredKey,
  generateObjectKey,
  resolveStoredTarget,
  resolveUploadTarget,
} from "./resolve-target";
import { errors } from "@/errors";
import type { OpenedRoute, UploadObjectContext } from "@/types";

const request = new Request("http://localhost");

function ctx(
  overrides: Partial<UploadObjectContext> = {},
): UploadObjectContext {
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
  overrides: Partial<OpenedRoute<"upload">> = {},
): OpenedRoute<"upload"> {
  return {
    name: "uploads",
    client: {} as OpenedRoute<"upload">["client"],
    bucket: "bucket",
    keyPrefix: "uploads",
    skippedPluginIds: new Set(),
    upload: { enabled: true, multipart: { enabled: false } },
    download: { enabled: false },
    delete: { enabled: false },
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
  it("joins a folder with a uuid/filename leaf", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(generateObjectKey("uploads", "a.png")).toBe(
      "uploads/11111111-1111-1111-1111-111111111111/a.png",
    );
  });

  it("strips path segments from the generated filename leaf", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(generateObjectKey("uploads", "../secret.png")).toBe(
      "uploads/11111111-1111-1111-1111-111111111111/secret.png",
    );
    expect(generateObjectKey("uploads", "foo/bar.png")).toBe(
      "uploads/11111111-1111-1111-1111-111111111111/bar.png",
    );
  });

  it("omits a folder when keyPrefix is unbound", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(generateObjectKey(false, "a.png")).toBe(
      "11111111-1111-1111-1111-111111111111/a.png",
    );
  });
});

describe("resolveUploadTarget", () => {
  it("lets object.key win over object.folder and nests under keyPrefix", async () => {
    await expect(
      resolveUploadTarget(
        route({
          upload: {
            enabled: true,
            multipart: { enabled: false },
            object: ({ file }: UploadObjectContext) => ({
              folder: "uploads",
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

  it("uses object.folder when key is omitted", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    await expect(
      resolveUploadTarget(
        route({
          upload: {
            enabled: true,
            multipart: { enabled: false },
            object: () => ({
              folder: "media",
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

  it("defaults to keyPrefix/uuid/filename", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    await expect(resolveUploadTarget(route(), ctx())).resolves.toMatchObject({
      key: "uploads/11111111-1111-1111-1111-111111111111/a.png",
    });
  });

  it("does not double-prefix a key already under keyPrefix", async () => {
    await expect(
      resolveUploadTarget(
        route({
          upload: {
            enabled: true,
            multipart: { enabled: false },
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
            multipart: { enabled: false },
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

  it("generates uuid/filename when keyPrefix is false", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    await expect(
      resolveUploadTarget(route({ keyPrefix: false }), ctx({ keyPrefix: false })),
    ).resolves.toMatchObject({
      key: "11111111-1111-1111-1111-111111111111/a.png",
    });
  });

  it("uses object.folder without a route folder when keyPrefix is false", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    await expect(
      resolveUploadTarget(
        route({
          keyPrefix: false,
          upload: {
            enabled: true,
            multipart: { enabled: false },
            object: () => ({ folder: "media" }),
          },
        }),
        ctx({ keyPrefix: false }),
      ),
    ).resolves.toMatchObject({
      key: "media/11111111-1111-1111-1111-111111111111/a.png",
    });
  });

  it("maps a plain Error from object() to FORBIDDEN", async () => {
    await expect(
      resolveUploadTarget(
        route({
          upload: {
            enabled: true,
            multipart: { enabled: false },
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
            multipart: { enabled: false },
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
