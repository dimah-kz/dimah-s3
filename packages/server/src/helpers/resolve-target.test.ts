import { describe, expect, it, vi } from "vitest";
import { S3_ERROR_CODES } from "@dimah-s3/core";
import {
  assertSafeObjectKey,
  assertStoredKey,
  generateObjectKey,
} from "./resolve-target";
import type { GenerateKeyContext } from "@/types";

const request = new Request("http://localhost");

function ctx(
  overrides: Partial<GenerateKeyContext> = {},
): GenerateKeyContext {
  return {
    request,
    route: "uploads",
    fileName: "a.png",
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

describe("generateObjectKey", () => {
  it("prefixes a generated uuid/filename leaf", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    await expect(
      generateObjectKey({ prefix: "uploads" }, ctx()),
    ).resolves.toBe("uploads/11111111-1111-1111-1111-111111111111/a.png");
  });

  it("defaults to route/uuid/filename when no prefix is set", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    await expect(generateObjectKey({}, ctx())).resolves.toBe(
      "uploads/11111111-1111-1111-1111-111111111111/a.png",
    );
  });

  it("lets resolveKey win over prefix", async () => {
    await expect(
      generateObjectKey(
        {
          prefix: "uploads",
          resolveKey: ({ fileName }) => `users/1/${fileName}`,
        },
        ctx(),
      ),
    ).resolves.toBe("users/1/a.png");
  });

  it("applies an async prefix factory", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    const prefix = async ({ request: req }: GenerateKeyContext) => {
      const userId = req.headers.get("x-user-id") ?? "anon";
      return `users/${userId}`;
    };
    await expect(
      generateObjectKey(
        { prefix },
        ctx({
          request: new Request("http://localhost", {
            headers: { "x-user-id": "42" },
          }),
        }),
      ),
    ).resolves.toBe("users/42/11111111-1111-1111-1111-111111111111/a.png");
  });
});

describe("assertStoredKey", () => {
  it("allows keys under a string prefix", () => {
    expect(assertStoredKey({ prefix: "uploads" }, "uploads/a.png")).toBe(
      "uploads/a.png",
    );
  });

  it("rejects keys outside a string prefix", () => {
    try {
      assertStoredKey({ prefix: "uploads" }, "other/a.png");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toMatchObject({ code: S3_ERROR_CODES.INVALID_KEY.code });
    }
  });

  it("does not namespace-check a prefix factory", () => {
    expect(
      assertStoredKey({ prefix: async () => "uploads" }, "anything/a.png"),
    ).toBe("anything/a.png");
  });
});
