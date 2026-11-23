import { describe, expect, it, vi } from "vitest";
import { sampleObject } from "@/test/fakes";
import type { DbPluginOptions } from "@/types/plugin";
import type { StorageFolder, StorageObject } from "@/types/storage-object";
import { createObjectAccess } from "./object-access";
import { createScopeResolver } from "./scope";

const call = { request: new Request("http://localhost/"), locals: {} };
const target = { operation: "download" as const, route: "uploads", key: "k" };
const ref = { bucket: "b", key: "k" };

const docs: StorageFolder = {
  id: "docs",
  scope: "user:1",
  parentId: null,
  name: "Docs",
  path: "Docs",
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function access(
  options: {
    row?: StorageObject | null;
    scope?: string | null;
    authorize?: DbPluginOptions["authorize"];
    findFolder?: (scope: string, id: string) => Promise<StorageFolder | null>;
  } = {},
) {
  const { row = sampleObject(), scope = "user:1" } = options;
  return createObjectAccess({
    objects: { find: async () => row },
    folders: {
      find:
        options.findFolder ??
        (async (owner, id) =>
          owner === docs.scope && id === docs.id ? docs : null),
    },
    resolveScope: createScopeResolver({ resolveScope: () => scope }),
    authorize: options.authorize,
  });
}

describe("createObjectAccess", () => {
  it("returns the row of the caller's scope", async () => {
    const row = sampleObject();

    await expect(access({ row }).object(call, target, ref)).resolves.toEqual({
      scope: expect.objectContaining({
        scope: "user:1",
        operation: "download",
        route: "uploads",
      }),
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
    await expect(
      access({ row: sampleObject({ status: "deleted" }) }).object(
        call,
        target,
        ref,
        { allowDeleted: true },
      ),
    ).resolves.toMatchObject({ object: { status: "deleted" } });
  });

  it("hides a row of another scope as not found, whatever authorize says", async () => {
    const authorize = vi.fn(() => true);

    await expect(
      access({ row: sampleObject({ scope: "user:2" }), authorize }).object(
        call,
        target,
        ref,
      ),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND", statusCode: 404 });
    expect(authorize).not.toHaveBeenCalled();
  });

  it("runs authorize with the scope, the target, and the stored row", async () => {
    const row = sampleObject({ folderId: "docs" });
    const authorize = vi.fn(() => false);

    await expect(
      access({ row, authorize }).object(call, target, ref),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        ...target,
        scope: "user:1",
        object: row,
      }),
    );
  });

  it("tells authorize where a stored object is, whatever the call names", async () => {
    const row = sampleObject({ folderId: "docs" });
    const authorize = vi.fn(() => true);
    const move = {
      ...target,
      operation: "update" as const,
      // A caller cannot pass off another folder as the object's own.
      folder: "Elsewhere",
      folderId: "elsewhere",
      destination: { folder: null, folderId: null },
    };

    await access({ row, authorize }).object(call, move, ref);

    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "update",
        folder: "Docs",
        folderId: "docs",
        destination: { folder: null, folderId: null },
        object: row,
      }),
    );
  });

  it("reports the root for an object outside every folder", async () => {
    const authorize = vi.fn(() => true);
    const findFolder = vi.fn(async () => null);

    await access({
      row: sampleObject({ folderId: null }),
      authorize,
      findFolder,
    }).object(call, target, ref);

    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ folder: null, folderId: null }),
    );
    expect(findFolder).not.toHaveBeenCalled();
  });

  it("leaves the path out when the object's folder is gone", async () => {
    const authorize = vi.fn(() => true);

    await access({
      row: sampleObject({ folderId: "gone" }),
      authorize,
    }).object(call, target, ref);

    const [context] = authorize.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(context.folderId).toBe("gone");
    expect(context).not.toHaveProperty("folder");
  });

  it("does not read the folder without authorize", async () => {
    const findFolder = vi.fn(async () => docs);

    await access({
      row: sampleObject({ folderId: "docs" }),
      findFolder,
    }).object(call, target, ref);

    expect(findFolder).not.toHaveBeenCalled();
  });

  it("runs authorize without an object for a scope check", async () => {
    const authorize = vi.fn(() => true);
    const upload = { operation: "upload" as const, folderId: "docs" };

    await expect(access({ authorize }).scope(call, upload)).resolves.toEqual(
      expect.objectContaining({ operation: "upload", scope: "user:1" }),
    );
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ ...upload, scope: "user:1" }),
    );
    expect(authorize).toHaveBeenCalledWith(
      expect.not.objectContaining({ object: expect.anything() }),
    );
  });
});
