import { describe, expect, it, vi } from "vitest";
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
  it("prefixes a generated uuid/filename leaf", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(generateObjectKey("uploads", ctx())).toBe(
      "uploads/11111111-1111-1111-1111-111111111111/a.png",
    );
  });

  it("defaults to route/uuid/filename when no prefix is set", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(generateObjectKey(undefined, ctx())).toBe(
      "uploads/11111111-1111-1111-1111-111111111111/a.png",
    );
  });
});

describe("resolveUploadTarget", () => {
  it("lets object.key win over object.prefix", async () => {
    await expect(
      resolveUploadTarget(
        route({
          object: ({ file }: ObjectContext) => ({
            prefix: "uploads",
            key: `users/1/${file.name}`,
          }),
        }),
        ctx(),
      ),
    ).resolves.toMatchObject({ key: "users/1/a.png", bucket: "bucket" });
  });

  it("uses object.prefix when key is omitted", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    await expect(
      resolveUploadTarget(
        route({
          object: () => ({
            prefix: "media",
            metadata: { author: "user_123" },
          }),
        }),
        ctx(),
      ),
    ).resolves.toEqual({
      key: "media/11111111-1111-1111-1111-111111111111/a.png",
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
  it("normalizes a safe stored key", () => {
    expect(assertStoredKey("uploads/a.png")).toBe("uploads/a.png");
  });
});
