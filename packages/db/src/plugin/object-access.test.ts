import { describe, expect, it, vi } from "vitest";
import { sampleObject } from "@/test/fakes";
import type { DbClientObject } from "@/types/client";
import type { DbPluginOptions } from "@/types/plugin";
import type { StorageObject } from "@/types/storage-object";
import { createObjectAccess } from "./object-access";
import { createScopeResolver } from "./scope";

const call = { request: new Request("http://localhost/"), locals: {} };
const target = { operation: "download" as const, route: "uploads", key: "k" };
const ref = { bucket: "b", key: "k" };

/** What `authorize` sees of a row in these tests. */
function toClientObject(object: StorageObject): DbClientObject {
  return {
    id: object.id,
    bucket: object.bucket,
    key: object.key,
    route: object.route,
    folder: object.folder,
    filename: object.filename,
    contentType: object.contentType,
    size: object.size,
    declaredSize: object.declaredSize,
    status: object.status,
    attributes: null,
    createdAt: object.createdAt.toISOString(),
    updatedAt: object.updatedAt.toISOString(),
  };
}

function access(
  options: {
    row?: StorageObject | null;
    scope?: string | null;
    authorize?: DbPluginOptions["authorize"];
  } = {},
) {
  const { row = sampleObject(), scope = "user:1" } = options;
  return createObjectAccess({
    objects: { find: async () => row },
    resolveScope: createScopeResolver({ resolveScope: () => scope }),
    authorize: options.authorize,
    toClientObject,
  });
}

describe("createObjectAccess", () => {
  it("returns the row of the caller's scope", async () => {
    const row = sampleObject();

    await expect(access({ row }).object(call, target, ref)).resolves.toEqual({
      scope: expect.objectContaining({ scope: "user:1", ...target }),
      object: row,
    });
  });

  it("rejects a call without a scope", async () => {
    await expect(
      access({ scope: null }).object(call, target, ref),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      access({ scope: null }).scope(call, target),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("treats a missing or deleted row as not found", async () => {
    await expect(
      access({ row: null }).object(call, target, ref),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND", statusCode: 404 });
    await expect(
      access({ row: sampleObject({ status: "deleted" }) }).object(
        call,
        target,
        ref,
      ),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });

  it("rejects a row of another scope, whatever authorize says", async () => {
    const authorize = vi.fn(() => true);

    await expect(
      access({ row: sampleObject({ scope: "user:2" }), authorize }).object(
        call,
        target,
        ref,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(authorize).not.toHaveBeenCalled();
  });

  it("runs authorize with the scope and the client view of the row", async () => {
    const row = sampleObject({ folder: "docs" });
    const authorize = vi.fn(() => false);

    await expect(
      access({ row, authorize }).object(call, target, ref),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        ...target,
        scope: "user:1",
        object: toClientObject(row),
      }),
    );
  });

  it("runs authorize without an object for a scope check", async () => {
    const authorize = vi.fn(() => true);
    const upload = { operation: "upload" as const, folder: "docs" };

    await expect(access({ authorize }).scope(call, upload)).resolves.toEqual(
      expect.objectContaining({ ...upload, scope: "user:1" }),
    );
    expect(authorize).toHaveBeenCalledWith(
      expect.not.objectContaining({ object: expect.anything() }),
    );
  });
});
