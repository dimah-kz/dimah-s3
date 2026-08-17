import { describe, expect, it } from "vitest";
import { createObjectAccessGuard } from "./create-object-access-guard";
import { fakeStore, sampleObject } from "../test/fakes";

const context = {
  request: new Request("http://local"),
  key: "k",
  bucket: "b",
};

describe("createObjectAccessGuard", () => {
  it("rejects unauthenticated requests", async () => {
    const guard = createObjectAccessGuard({
      db: fakeStore(),
      resolveScope: async () => null,
    });
    await expect(guard(context)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("rejects missing or inactive objects", async () => {
    const guard = createObjectAccessGuard({
      db: fakeStore({
        find: async () => sampleObject({ status: "pending" }),
      }),
      resolveScope: async () => "user:1",
    });
    await expect(guard(context)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("rejects objects owned by another scope", async () => {
    const guard = createObjectAccessGuard({
      db: fakeStore({
        find: async () => sampleObject({ scope: "user:2" }),
      }),
      resolveScope: async () => "user:1",
    });
    await expect(guard(context)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("allows the owning scope", async () => {
    const guard = createObjectAccessGuard({
      db: fakeStore({
        find: async () => sampleObject(),
      }),
      resolveScope: async () => "user:1",
    });
    await expect(guard(context)).resolves.toBeUndefined();
  });

  it("uses a custom authorize function", async () => {
    const guard = createObjectAccessGuard({
      db: fakeStore({
        find: async () => sampleObject({ scope: "user:2" }),
      }),
      resolveScope: async () => "user:1",
      authorize: async () => true,
    });
    await expect(guard(context)).resolves.toBeUndefined();
  });
});
