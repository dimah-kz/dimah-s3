import { S3Client } from "@aws-sdk/client-s3";
import { dimahS3, route, type DimahS3RouteConfig } from "@dimah-s3/server";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { insertObject } from "@/test/databases";
import { memoryDbClient } from "@/test/fakes";
import type {
  DbClientFolder,
  DbClientListResponse,
  DbClientObject,
} from "@/types/client";
import type { DbPluginOptions } from "@/types/plugin";
import type { StorageObject } from "@/types/storage-object";
import { db } from "./db";
import { DEFAULT_ATTRIBUTES_MAX_BYTES } from "./create-database-endpoints";

const SECRET = "db-test-secret-0123456789abcdef-0123456789";
const DB_URL = "http://localhost/api/s3/db";

type Attributes = { title: string; internal?: string };
type ClientAttributes = { title: string };
type PluginOptions = DbPluginOptions<undefined, Attributes, ClientAttributes>;
type ListBody = DbClientListResponse<ClientAttributes>;
type ObjectBody = { object: DbClientObject<ClientAttributes> };
type FolderBody = { folder: DbClientFolder };

/** Scope from the `x-user` header; no header means signed out. */
const userScope: PluginOptions["resolveScope"] = ({ request }) => {
  const user = request.headers.get("x-user");
  return user ? `user:${user}` : null;
};

const attributesOption: NonNullable<PluginOptions["attributes"]> = {
  schema: z.object({
    title: z.string().min(1),
    internal: z.string().optional(),
  }),
  toClient: ({ title }) => ({ title }),
};

function createSetup(
  options: {
    plugin?: Partial<PluginOptions>;
    routes?: Record<string, DimahS3RouteConfig>;
  } = {},
) {
  const database = memoryDbClient();
  const instance = dimahS3({
    client: new S3Client({
      region: "us-east-1",
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
    bucket: "bucket",
    secret: SECRET,
    logger: { warn: vi.fn(), error: vi.fn() },
    plugins: [
      db<undefined, Attributes, ClientAttributes>({
        client: database,
        resolveScope: userScope,
        ...options.plugin,
      }),
    ],
    routes: options.routes ?? { uploads: route({ upload: true }) },
  });

  /** Inserts a row in `bucket`: an active `user:1` file at the root by default. */
  const insert = (values: Partial<StorageObject<unknown>> & { key: string }) =>
    insertObject(database, { bucket: "bucket", ...values });

  /** Sends a request as `user` (`null` is signed out). */
  const request = async <T = unknown>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    input: { query?: Record<string, string>; body?: unknown } = {},
    user: string | null = "1",
  ) => {
    const query = input.query ? `?${new URLSearchParams(input.query)}` : "";
    const response = await instance.handler(
      new Request(`${DB_URL}${path}${query}`, {
        method,
        headers: {
          ...(user !== null && { "x-user": user }),
          ...(input.body !== undefined && {
            "content-type": "application/json",
          }),
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      }),
    );
    return { status: response.status, body: (await response.json()) as T };
  };

  return { instance, database, insert, request };
}

describe("GET /db/objects", () => {
  it("lists one folder with usage, limits, and child folders on the first page", async () => {
    const { instance, insert, request } = createSetup({
      plugin: { quota: { maxFiles: 10 } },
    });
    await insert({ key: "a.txt", size: 3 });
    await insert({ key: "b.txt", size: 4, folder: "docs" });
    await insert({ key: "c.txt", size: 5, scope: "user:2" });
    await instance.db.folders.ensure("user:1", "docs/q4");
    await instance.db.folders.ensure("user:1", "photos");
    await instance.db.folders.ensure("user:2", "theirs");

    const { status, body } = await request<ListBody>("GET", "/objects", {
      query: { folder: "" },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      scope: "user:1",
      objects: [{ key: "a.txt", folder: null }],
      nextCursor: null,
      usage: { totalBytes: 7, objectCount: 2 },
      limits: { maxFiles: 10 },
      folders: [
        { path: "docs", name: "docs", parent: null },
        { path: "photos", name: "photos", parent: null },
      ],
    });
    expect(body.objects).toHaveLength(1);
  });

  it("lists the child folders of a nested folder", async () => {
    const { instance, insert, request } = createSetup();
    await insert({ key: "b.txt", folder: "docs" });
    await instance.db.folders.ensure("user:1", "docs/q4");

    const { body } = await request<ListBody>("GET", "/objects", {
      query: { folder: "docs" },
    });

    expect(body.objects).toMatchObject([{ key: "b.txt", folder: "docs" }]);
    expect(body.folders).toMatchObject([{ path: "docs/q4", parent: "docs" }]);
    expect(body.limits).toBeNull();
  });

  it("lists every folder without folder rows when folder is omitted", async () => {
    const { instance, insert, request } = createSetup();
    await insert({ key: "a.txt" });
    await insert({ key: "b.txt", folder: "docs" });
    await instance.db.folders.ensure("user:1", "docs");

    const { body } = await request<ListBody>("GET", "/objects", {
      query: { sort: JSON.stringify({ field: "filename", direction: "asc" }) },
    });

    expect(body.objects.map((object) => object.key)).toEqual([
      "a.txt",
      "b.txt",
    ]);
    expect(body).not.toHaveProperty("folders");
    expect(body.usage).toEqual({ totalBytes: 0, objectCount: 2 });
  });

  it("pages with the cursor and sends usage on the first page only", async () => {
    const { insert, request } = createSetup();
    for (const [index, key] of ["a", "b", "c"].entries()) {
      await insert({
        key,
        updatedAt: new Date(Date.UTC(2024, 0, index + 1)),
      });
    }
    const sort = JSON.stringify({ field: "updatedAt", direction: "desc" });

    const first = await request<ListBody>("GET", "/objects", {
      query: { sort, limit: "2" },
    });
    expect(first.body.objects.map((object) => object.key)).toEqual(["c", "b"]);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await request<ListBody>("GET", "/objects", {
      query: { sort, limit: "2", cursor: String(first.body.nextCursor) },
    });
    expect(second.body).toEqual({
      scope: "user:1",
      objects: [expect.objectContaining({ key: "a" })],
      nextCursor: null,
    });
  });

  it("restarts at the first page when the filters change", async () => {
    const { insert, request } = createSetup();
    await insert({ key: "a" });
    await insert({ key: "b" });

    const first = await request<ListBody>("GET", "/objects", {
      query: { limit: "1" },
    });
    const restarted = await request<ListBody>("GET", "/objects", {
      query: { limit: "1", search: "b", cursor: String(first.body.nextCursor) },
    });

    expect(restarted.body).toMatchObject({
      objects: [{ key: "b" }],
      usage: { objectCount: 2 },
    });
  });

  it("filters by search, route, and status", async () => {
    const { insert, request } = createSetup();
    await insert({ key: "invoice.pdf" });
    await insert({ key: "photo.png" });
    await insert({ key: "old-invoice.pdf", status: "deleted" });

    const { body } = await request<ListBody>("GET", "/objects", {
      query: { search: " invoice ", route: "uploads", status: "deleted" },
    });

    expect(body.objects).toMatchObject([{ key: "old-invoice.pdf" }]);
  });

  it("authorizes the listing with op list and the folder", async () => {
    const authorize = vi.fn<NonNullable<PluginOptions["authorize"]>>(
      () => false,
    );
    const { request } = createSetup({ plugin: { authorize } });

    const { status, body } = await request<ListBody>("GET", "/objects", {
      query: { folder: "docs" },
    });

    expect(status).toBe(403);
    expect(body).toMatchObject({ code: "FORBIDDEN" });
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "list",
        folder: "docs",
        scope: "user:1",
      }),
    );
  });

  it("rejects a signed-out caller, a bad folder, and removed query keys", async () => {
    const { request } = createSetup();

    await expect(request("GET", "/objects", {}, null)).resolves.toMatchObject({
      status: 401,
      body: { code: "UNAUTHORIZED" },
    });
    await expect(
      request("GET", "/objects", { query: { folder: "a/../b" } }),
    ).resolves.toMatchObject({ status: 400, body: { code: "FOLDER_INVALID" } });
    await expect(
      request("GET", "/objects", { query: { offset: "10" } }),
    ).resolves.toMatchObject({
      status: 400,
      body: { code: "VALIDATION_ERROR" },
    });
  });
});

describe("GET /db/object", () => {
  it("returns an object of the scope and authorizes it with op read", async () => {
    const authorize = vi.fn<NonNullable<PluginOptions["authorize"]>>(
      () => true,
    );
    const { insert, request } = createSetup({
      plugin: { authorize, attributes: attributesOption },
    });
    await insert({
      key: "a.txt",
      folder: "docs",
      attributes: { title: "A", internal: "x" },
    });

    const { status, body } = await request<ObjectBody>("GET", "/object", {
      query: { key: "a.txt" },
    });

    expect(status).toBe(200);
    expect(body.object).toMatchObject({
      bucket: "bucket",
      key: "a.txt",
      folder: "docs",
      attributes: { title: "A" },
      updatedAt: expect.any(String),
    });
    expect(body.object).not.toHaveProperty("scope");
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "read",
        key: "a.txt",
        object: expect.objectContaining({ key: "a.txt" }),
      }),
    );
  });

  it("hides missing, deleted, and purging rows, and refuses other scopes", async () => {
    const { insert, request } = createSetup();
    await insert({ key: "gone", status: "deleted" });
    await insert({ key: "purging", status: "purging" });
    await insert({ key: "theirs", scope: "user:2" });

    for (const key of ["missing", "gone", "purging"]) {
      await expect(
        request("GET", "/object", { query: { key } }),
      ).resolves.toMatchObject({
        status: 404,
        body: { code: "OBJECT_NOT_FOUND" },
      });
    }
    await expect(
      request("GET", "/object", { query: { key: "theirs" } }),
    ).resolves.toMatchObject({ status: 403, body: { code: "FORBIDDEN" } });
  });

  it("requires a configured bucket, and one when the routes use several", async () => {
    const { insert, request } = createSetup({
      routes: {
        uploads: route({ upload: true }),
        archive: route({ bucket: "archive", upload: true }),
      },
    });
    await insert({ key: "a.txt", bucket: "archive" });

    await expect(
      request("GET", "/object", { query: { key: "a.txt" } }),
    ).resolves.toMatchObject({
      status: 400,
      body: { code: "VALIDATION_ERROR" },
    });
    await expect(
      request("GET", "/object", { query: { key: "a.txt", bucket: "other" } }),
    ).resolves.toMatchObject({
      status: 400,
      body: { code: "VALIDATION_ERROR" },
    });
    await expect(
      request("GET", "/object", { query: { key: "a.txt", bucket: "archive" } }),
    ).resolves.toMatchObject({
      status: 200,
      body: { object: { bucket: "archive", key: "a.txt" } },
    });
  });
});

describe("PATCH /db/object", () => {
  it("renames and moves an object, creating the target folder", async () => {
    const authorize = vi.fn<NonNullable<PluginOptions["authorize"]>>(
      () => true,
    );
    const { instance, insert, request } = createSetup({
      plugin: { authorize },
    });
    await insert({ key: "a.txt", updatedAt: new Date("2024-01-01") });

    const { status, body } = await request<ObjectBody>("PATCH", "/object", {
      body: { key: "a.txt", filename: "notes.txt", folder: "docs/q4" },
    });

    expect(status).toBe(200);
    expect(body.object).toMatchObject({
      filename: "notes.txt",
      folder: "docs/q4",
    });
    expect(body.object.updatedAt).not.toBe("2024-01-01T00:00:00.000Z");
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "update", folder: "docs/q4" }),
    );
    await expect(
      instance.db.folders.find("user:1", "docs"),
    ).resolves.not.toBeNull();
    await expect(
      instance.db.folders.find("user:1", "docs/q4"),
    ).resolves.not.toBeNull();
  });

  it("moves an object to the root with null", async () => {
    const { insert, request } = createSetup();
    await insert({ key: "a.txt", folder: "docs" });

    const { body } = await request<ObjectBody>("PATCH", "/object", {
      body: { key: "a.txt", folder: null },
    });

    expect(body.object.folder).toBeNull();
  });

  it("returns the object unchanged when the body changes nothing", async () => {
    const { insert, request } = createSetup();
    await insert({ key: "a.txt", updatedAt: new Date("2024-01-01") });

    const { body } = await request<ObjectBody>("PATCH", "/object", {
      body: { key: "a.txt" },
    });

    expect(body.object.updatedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("validates attributes with the schema and stores what it returns", async () => {
    const { instance, insert, request } = createSetup({
      plugin: { attributes: attributesOption },
    });
    await insert({ key: "a.txt" });

    const invalid = await request("PATCH", "/object", {
      body: { key: "a.txt", attributes: { title: "" } },
    });
    expect(invalid).toMatchObject({
      status: 400,
      body: { code: "VALIDATION_ERROR" },
    });

    const { body } = await request<ObjectBody>("PATCH", "/object", {
      body: { key: "a.txt", attributes: { title: "Q4", internal: "x" } },
    });
    expect(body.object.attributes).toEqual({ title: "Q4" });
    await expect(
      instance.db.objects.find({ bucket: "bucket", key: "a.txt" }),
    ).resolves.toMatchObject({ attributes: { title: "Q4", internal: "x" } });
  });

  it("rejects attributes without a schema", async () => {
    const { insert, request } = createSetup();
    await insert({ key: "a.txt" });

    await expect(
      request("PATCH", "/object", {
        body: { key: "a.txt", attributes: { title: "Q4" } },
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: { code: "VALIDATION_ERROR" },
    });
  });

  it("caps attributes at maxBytes of JSON", async () => {
    const byDefault = createSetup({ plugin: { attributes: attributesOption } });
    await byDefault.insert({ key: "a.txt" });
    await expect(
      byDefault.request("PATCH", "/object", {
        body: {
          key: "a.txt",
          attributes: { title: "a".repeat(DEFAULT_ATTRIBUTES_MAX_BYTES) },
        },
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: { code: "VALIDATION_ERROR" },
    });

    const custom = createSetup({
      plugin: { attributes: { ...attributesOption, maxBytes: 20 } },
    });
    await custom.insert({ key: "a.txt" });
    await expect(
      custom.request("PATCH", "/object", {
        body: { key: "a.txt", attributes: { title: "a".repeat(10) } },
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: { code: "VALIDATION_ERROR" },
    });
    await expect(
      custom.request("PATCH", "/object", {
        body: { key: "a.txt", attributes: { title: "a" } },
      }),
    ).resolves.toMatchObject({ status: 200 });
  });

  it("rejects a foreign bucket, a bad folder, and a row that is not active", async () => {
    const { insert, request } = createSetup();
    await insert({ key: "a.txt" });
    await insert({ key: "pending.txt", status: "pending" });

    await expect(
      request("PATCH", "/object", {
        body: { key: "a.txt", bucket: "other", filename: "b.txt" },
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: { code: "VALIDATION_ERROR" },
    });
    await expect(
      request("PATCH", "/object", { body: { key: "a.txt", folder: "/docs" } }),
    ).resolves.toMatchObject({ status: 400, body: { code: "FOLDER_INVALID" } });
    await expect(
      request("PATCH", "/object", {
        body: { key: "pending.txt", filename: "b.txt" },
      }),
    ).resolves.toMatchObject({
      status: 404,
      body: { code: "OBJECT_NOT_FOUND" },
    });
  });

  it("refuses an object of another scope", async () => {
    const { insert, request } = createSetup();
    await insert({ key: "a.txt", scope: "user:2" });

    await expect(
      request("PATCH", "/object", { body: { key: "a.txt", filename: "b" } }),
    ).resolves.toMatchObject({ status: 403, body: { code: "FORBIDDEN" } });
  });

  it("accepts only a JSON body", async () => {
    const { insert, instance } = createSetup();
    await insert({ key: "a.txt" });

    const response = await instance.handler(
      new Request(`${DB_URL}/object`, {
        method: "PATCH",
        headers: {
          "x-user": "1",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "key=a.txt&filename=b.txt",
      }),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });
});

describe("POST /db/folder", () => {
  it("creates a folder with its ancestors", async () => {
    const authorize = vi.fn<NonNullable<PluginOptions["authorize"]>>(
      () => true,
    );
    const { instance, request } = createSetup({ plugin: { authorize } });

    const { status, body } = await request("POST", "/folder", {
      body: { path: "docs/q4" },
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      folder: {
        path: "docs/q4",
        name: "q4",
        parent: "docs",
        createdAt: expect.any(String),
      },
    });
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "update", folder: "docs/q4" }),
    );
    await expect(
      instance.db.folders.find("user:1", "docs"),
    ).resolves.not.toBeNull();
  });

  it("stores the NFC form of the path", async () => {
    const { request } = createSetup();

    const decomposed = "café".normalize("NFD");
    const { body } = await request<FolderBody>("POST", "/folder", {
      body: { path: decomposed },
    });

    expect(body.folder.path).toBe(decomposed.normalize("NFC"));
  });

  it("rejects an existing folder, the root, and an invalid path", async () => {
    const { request } = createSetup();
    await request("POST", "/folder", { body: { path: "docs" } });

    await expect(
      request("POST", "/folder", { body: { path: "docs" } }),
    ).resolves.toMatchObject({ status: 409, body: { code: "CONFLICT" } });
    for (const path of ["", "docs/", "a/./b"]) {
      await expect(
        request("POST", "/folder", { body: { path } }),
      ).resolves.toMatchObject({
        status: 400,
        body: { code: "FOLDER_INVALID" },
      });
    }
  });

  it("accepts only a JSON body", async () => {
    const { instance } = createSetup();

    const response = await instance.handler(
      new Request(`${DB_URL}/folder`, {
        method: "POST",
        headers: {
          "x-user": "1",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "path=docs",
      }),
    );

    expect(response.status).toBe(415);
  });
});

describe("DELETE /db/folder", () => {
  it("removes an empty folder", async () => {
    const { instance, request } = createSetup();
    await instance.db.folders.ensure("user:1", "docs");

    const { status, body } = await request("DELETE", "/folder", {
      query: { path: "docs" },
    });

    expect(status).toBe(200);
    expect(body).toEqual({ path: "docs" });
    await expect(
      instance.db.folders.find("user:1", "docs"),
    ).resolves.toBeNull();
  });

  it("refuses a folder with objects or child folders", async () => {
    const { instance, insert, request } = createSetup();
    await instance.db.folders.ensure("user:1", "docs/q4");
    await instance.db.folders.ensure("user:1", "photos");
    await insert({ key: "a.png", folder: "photos" });

    for (const path of ["docs", "photos"]) {
      await expect(
        request("DELETE", "/folder", { query: { path } }),
      ).resolves.toMatchObject({
        status: 409,
        body: { code: "FOLDER_NOT_EMPTY" },
      });
    }
  });

  it("only touches the caller's scope", async () => {
    const { instance, request } = createSetup();
    await instance.db.folders.ensure("user:2", "docs");

    await request("DELETE", "/folder", { query: { path: "docs" } });

    await expect(
      instance.db.folders.find("user:2", "docs"),
    ).resolves.not.toBeNull();
    await expect(
      request("DELETE", "/folder", { query: { path: "" } }),
    ).resolves.toMatchObject({ status: 400, body: { code: "FOLDER_INVALID" } });
  });
});
