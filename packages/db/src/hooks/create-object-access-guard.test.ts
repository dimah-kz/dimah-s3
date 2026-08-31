import { describe, expect, it } from "vitest";
import { createObjectAccessGuard } from "./create-object-access-guard";
import { fakeStore, sampleObject } from "@/test/fakes";

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
      status: "UNAUTHORIZED",
      statusCode: 401,
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
      code: "OBJECT_NOT_FOUND",
      status: "NOT_FOUND",
      statusCode: 404,
    });
  });

  it("treats any as pending or active, not deleted", async () => {
    const deleted = createObjectAccessGuard({
      db: fakeStore({
        find: async () => sampleObject({ status: "deleted" }),
      }),
      resolveScope: async () => "user:1",
      requireStatus: "any",
    });
    await expect(deleted(context)).rejects.toMatchObject({
      code: "OBJECT_NOT_FOUND",
    });

    const pending = createObjectAccessGuard({
      db: fakeStore({
        find: async () => sampleObject({ status: "pending" }),
      }),
      resolveScope: async () => "user:1",
      requireStatus: "any",
    });
    await expect(pending(context)).resolves.toBeUndefined();
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
      status: "FORBIDDEN",
      statusCode: 403,
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

  it("requires a matching uploadId when asked", async () => {
    const guard = createObjectAccessGuard({
      db: fakeStore({
        find: async () => sampleObject({ status: "pending", uploadId: "up-1" }),
      }),
      resolveScope: async () => "user:1",
      requireStatus: "pending",
      requireUploadId: true,
    });
    await expect(
      guard({ ...context, uploadId: "up-other" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      guard({ ...context, uploadId: "up-1" }),
    ).resolves.toBeUndefined();
  });
});
