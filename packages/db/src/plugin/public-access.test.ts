import { describe, expect, it, vi } from "vitest";
import { sampleFolder, sampleObject } from "@/test/fakes";
import type { DbPluginOptions } from "@/types/plugin";
import type { StorageObject } from "@/types/storage-object";
import { createObjectAccess } from "./object-access";
import { createPublicAccess } from "./public-access";
import { createScopeResolver } from "./scope";

const call = { request: new Request("http://localhost/"), locals: {} };
const target = { plugin: { id: "share", action: "createLink" } };
const docs = sampleFolder({ id: "docs", name: "Docs", path: "Docs" });

function setup(
  options: {
    row?: StorageObject | null;
    scope?: string | null;
    authorize?: DbPluginOptions["authorize"];
    resolveScope?: DbPluginOptions["resolveScope"];
  } = {},
) {
  const { row = sampleObject(), scope = "user:1" } = options;
  const objects = {
    find: vi.fn(async () => row),
    findById: vi.fn(async () => row),
  };
  const folders = {
    find: async (owner: string, id: string) =>
      owner === docs.scope && id === docs.id ? docs : null,
  };
  const resolveScope = createScopeResolver({
    resolveScope: options.resolveScope ?? (() => scope),
  });
  const access = createObjectAccess({
    objects,
    folders,
    resolveScope,
    authorize: options.authorize,
  });
  return {
    objects,
    access: createPublicAccess({ objects, folders, resolveScope, access }),
  };
}

describe("s3.db.access", () => {
  it("resolves the scope as a plugin call", async () => {
    const resolveScope = vi.fn(() => "user:1");
    const authorize = vi.fn(() => true);
    const { access } = setup({ resolveScope, authorize });

    await expect(access.scope(call, target)).resolves.toMatchObject({
      scope: "user:1",
      operation: "plugin",
      plugin: { id: "share", action: "createLink" },
    });
    expect(resolveScope).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "plugin",
        plugin: { id: "share", action: "createLink" },
      }),
    );
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "plugin", scope: "user:1" }),
    );
  });

  it("rejects a caller without a scope, and what authorize refuses", async () => {
    await expect(
      setup({ scope: null }).access.scope(call, target),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      setup({ authorize: () => false }).access.scope(call, target),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("loads an active object by key or by id, and shows it to authorize", async () => {
    const row = sampleObject({ id: "o1", key: "uploads/a.txt" });
    const authorize = vi.fn(() => true);
    const { access, objects } = setup({ row, authorize });

    await expect(
      access.object(call, target, { bucket: "b", key: "uploads/a.txt" }),
    ).resolves.toMatchObject({ caller: { scope: "user:1" }, object: row });
    expect(objects.find).toHaveBeenCalledWith({
      bucket: "b",
      key: "uploads/a.txt",
    });

    await access.object(call, target, { id: "o1" });
    expect(objects.findById).toHaveBeenCalledWith("o1");
    expect(authorize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operation: "plugin",
        plugin: { id: "share", action: "createLink" },
        key: "uploads/a.txt",
        object: row,
        folder: null,
        folderId: null,
      }),
    );
  });

  it("treats a missing, pending, deleted, or foreign object as not found", async () => {
    for (const row of [
      null,
      sampleObject({ status: "pending" }),
      sampleObject({ status: "deleted" }),
      sampleObject({ scope: "user:2" }),
    ]) {
      await expect(
        setup({ row }).access.object(call, target, { id: "1" }),
      ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    }
  });

  it("loads a folder of the scope, or the root, and shows it to authorize", async () => {
    const authorize = vi.fn(() => true);
    const { access } = setup({ authorize });

    await expect(access.folder(call, target, "docs")).resolves.toMatchObject({
      caller: { scope: "user:1" },
      folder: docs,
    });
    expect(authorize).toHaveBeenLastCalledWith(
      expect.objectContaining({ folder: "Docs", folderId: "docs" }),
    );

    await expect(access.folder(call, target, null)).resolves.toMatchObject({
      folder: null,
    });
    expect(authorize).toHaveBeenLastCalledWith(
      expect.objectContaining({ folder: null, folderId: null }),
    );
  });

  it("rejects a folder of another scope as not found", async () => {
    await expect(
      setup({ scope: "user:2" }).access.folder(call, target, "docs"),
    ).rejects.toMatchObject({ code: "FOLDER_NOT_FOUND" });
  });
});
