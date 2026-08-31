import { describe, expect, it, vi } from "vitest";
import { S3_ERROR_CODES } from "@dimah-s3/core";
import {
  assertSafeObjectKey,
  assertStoredKey,
  generateObjectKey,
  resolveUploadTarget,
} from "./resolve-target";
import type { ObjectContext, ResolvedRoutePolicy } from "@/types";

const request = new Request("http://localhost");

function ctx(overrides: Partial<ObjectContext> = {}): ObjectContext {
  return {
    request,
    route: "uploads",
    file: { name: "a.png" },
    bucket: "bucket",
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
  it("prefixes a generated uuid/filename leaf", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    await expect(generateObjectKey("uploads", ctx())).resolves.toBe(
      "uploads/11111111-1111-1111-1111-111111111111/a.png",
    );
  });

  it("defaults to route/uuid/filename when no prefix is set", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    await expect(generateObjectKey(undefined, ctx())).resolves.toBe(
      "uploads/11111111-1111-1111-1111-111111111111/a.png",
    );
  });

  it("applies an async prefix factory", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    const prefix = async ({ request: req }: ObjectContext) => {
      const userId = req.headers.get("x-user-id") ?? "anon";
      return `users/${userId}`;
    };
    await expect(
      generateObjectKey(
        prefix,
        ctx({
          request: new Request("http://localhost", {
            headers: { "x-user-id": "42" },
          }),
        }),
      ),
    ).resolves.toBe("users/42/11111111-1111-1111-1111-111111111111/a.png");
  });
});

describe("resolveUploadTarget", () => {
  it("lets object.key win over prefix", async () => {
    await expect(
      resolveUploadTarget(
        route({
          prefix: "uploads",
          object: ({ file }: ObjectContext) => ({
            key: `users/1/${file.name}`,
          }),
        }),
        ctx(),
      ),
    ).resolves.toMatchObject({ key: "users/1/a.png", bucket: "bucket" });
  });

  it("keeps the generated key when object only returns metadata", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    await expect(
      resolveUploadTarget(
        route({
          prefix: "uploads",
          object: () => ({ metadata: { author: "user_123" } }),
        }),
        ctx(),
      ),
    ).resolves.toEqual({
      key: "uploads/11111111-1111-1111-1111-111111111111/a.png",
      bucket: "bucket",
      metadata: { author: "user_123" },
      acl: "private",
    });
  });

  it("lets object override the route ACL", async () => {
    await expect(
      resolveUploadTarget(
        route({
          acl: "private",
          object: () => ({ key: "a.png", acl: "public-read" }),
        }),
        ctx(),
      ),
    ).resolves.toMatchObject({ key: "a.png", acl: "public-read" });
  });
});

describe("assertStoredKey", () => {
  it("allows keys under a string prefix", () => {
    expect(assertStoredKey("uploads", "uploads/a.png")).toBe("uploads/a.png");
  });

  it("rejects keys outside a string prefix", () => {
    try {
      assertStoredKey("uploads", "other/a.png");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toMatchObject({ code: S3_ERROR_CODES.INVALID_KEY.code });
    }
  });

  it("does not namespace-check a prefix factory", () => {
    expect(assertStoredKey(async () => "uploads", "anything/a.png")).toBe(
      "anything/a.png",
    );
  });
});
