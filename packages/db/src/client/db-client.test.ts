import { APIError, createS3Client } from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import type { DbClientFolder, DbClientObject } from "@/types/client";
import { dbClient } from "./db-client";
import { dbObjectSource } from "./db-object-source";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A client over a fake `fetch` that answers every call with `body`. */
function setup(body: unknown = {}, status = 200) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const href = input instanceof Request ? input.url : String(input);
      calls.push({ url: new URL(href, "http://localhost"), init: init ?? {} });
      return jsonResponse(body, status);
    },
  );
  const api = createS3Client({ fetch, plugins: [dbClient()] });
  return { api, calls };
}

/** The parsed JSON body of a recorded call. */
function jsonBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string")
    throw new TypeError("Expected a JSON body");
  return JSON.parse(init.body);
}

const object: DbClientObject = {
  id: "row-1",
  bucket: "b",
  key: "users/1/notes.md",
  route: "docs",
  folderId: "work",
  filename: "Notes.md",
  contentType: "text/markdown",
  size: 4096,
  declaredSize: 4096,
  status: "active",
  attributes: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z",
};

const folder: DbClientFolder = {
  id: "folder-1",
  path: "work/drafts",
  name: "drafts",
  parentId: "work",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

describe("dbClient", () => {
  it("lists objects over GET /db/objects with the query and signal", async () => {
    const { api, calls } = setup({ objects: [], nextCursor: null });
    const controller = new AbortController();

    await expect(
      api.db.listObjects(
        {
          folderId: "",
          search: "q3 report",
          sort: { field: "updatedAt", direction: "desc" },
          limit: 10,
        },
        { signal: controller.signal },
      ),
    ).resolves.toEqual({ objects: [], nextCursor: null });

    const [call] = calls;
    expect(call?.url.pathname).toBe("/api/s3/db/objects");
    expect(call?.init.method).toBe("GET");
    expect(call?.init.signal).toBe(controller.signal);
    const query = call?.url.searchParams;
    expect(query?.get("folderId")).toBe("");
    expect(query?.get("search")).toBe("q3 report");
    expect(query?.get("limit")).toBe("10");
    expect(JSON.parse(query?.get("sort") ?? "null")).toEqual({
      field: "updatedAt",
      direction: "desc",
    });
  });

  it("sends the root as an empty folder and forwards per-call headers", async () => {
    const { api, calls } = setup({ objects: [], nextCursor: null });

    await api.db.listObjects(
      { folderId: null },
      { headers: { "x-tenant": "acme" } },
    );

    expect(calls[0]?.url.searchParams.get("folderId")).toBe("");
    expect(new Headers(calls[0]?.init.headers).get("x-tenant")).toBe("acme");
  });

  it("loads one object over GET /db/object", async () => {
    const { api, calls } = setup({ object });

    await expect(
      api.db.getObject({ key: object.key, bucket: "b" }),
    ).resolves.toEqual({ object });

    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.url.pathname).toBe("/api/s3/db/object");
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({
      key: object.key,
      bucket: "b",
    });
  });

  it("updates an object over PATCH /db/object with a JSON body", async () => {
    const { api, calls } = setup({ object });

    await api.db.updateObject({
      key: object.key,
      folderId: null,
      filename: "a.md",
    });

    expect(calls[0]?.init.method).toBe("PATCH");
    expect(calls[0]?.url.pathname).toBe("/api/s3/db/object");
    expect(jsonBody(calls[0]?.init)).toEqual({
      key: object.key,
      folderId: null,
      filename: "a.md",
    });
  });

  it("creates a folder over POST /db/folder", async () => {
    const { api, calls } = setup({ folder });

    await expect(
      api.db.createFolder({ parentId: folder.parentId, name: folder.name }),
    ).resolves.toEqual({ folder });

    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.url.pathname).toBe("/api/s3/db/folder");
    expect(jsonBody(calls[0]?.init)).toEqual({
      parentId: folder.parentId,
      name: folder.name,
    });
  });

  it("renames a folder over PATCH /db/folder", async () => {
    const { api, calls } = setup({ folder });

    await api.db.updateFolder({ id: folder.id, name: "notes" });

    expect(calls[0]?.init.method).toBe("PATCH");
    expect(jsonBody(calls[0]?.init)).toEqual({ id: folder.id, name: "notes" });
  });

  it("deletes a folder over DELETE /db/folder with the id in the query", async () => {
    const { api, calls } = setup({ id: folder.id });

    await expect(api.db.deleteFolder({ id: folder.id })).resolves.toEqual({
      id: folder.id,
    });

    expect(calls[0]?.init.method).toBe("DELETE");
    expect(calls[0]?.url.pathname).toBe("/api/s3/db/folder");
    expect(calls[0]?.url.searchParams.get("id")).toBe(folder.id);
  });

  it("rejects with the server's error code", async () => {
    const { api } = setup(
      { code: "FOLDER_NOT_EMPTY", message: "Folder is not empty" },
      409,
    );

    const error: unknown = await api.db
      .deleteFolder({ id: "work" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ statusCode: 409, code: "FOLDER_NOT_EMPTY" });
  });

  it("gives dbObjectSource the actions it needs", async () => {
    const { api, calls } = setup({ folder });

    const source = dbObjectSource(api.db);
    await expect(
      source.createFolder?.({ parent: "work", name: "drafts" }),
    ).resolves.toEqual({ id: "folder-1", name: "drafts" });
    expect(calls[0]?.url.pathname).toBe("/api/s3/db/folder");
  });
});
