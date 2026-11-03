import { describe, expect, it } from "vitest";
import * as z from "zod";
import { DEFAULT_LIST_LIMIT } from "@/store/object-store";
import {
  DB_LIST_MAX_LIMIT,
  dbCreateFolderBodySchema,
  dbDeleteFolderQuerySchema,
  dbListQuerySchema,
  dbObjectQuerySchema,
  dbUpdateFolderBodySchema,
  dbUpdateObjectBodySchema,
} from "./schemas";

describe("dbListQuerySchema", () => {
  it("defaults limit when the query is empty", () => {
    expect(dbListQuerySchema.parse({})).toEqual({ limit: DEFAULT_LIST_LIMIT });
  });

  it("keeps an empty folder id, which is the root", () => {
    expect(dbListQuerySchema.parse({ folderId: "" })).toMatchObject({
      folderId: "",
    });
  });

  it("reads limit from a string or a number", () => {
    expect(dbListQuerySchema.parse({ limit: "10" })).toEqual({ limit: 10 });
    expect(dbListQuerySchema.parse({ limit: 10 })).toEqual({ limit: 10 });
  });

  it("rejects an invalid status and out-of-range limits", () => {
    expect(dbListQuerySchema.safeParse({ status: "nope" }).success).toBe(false);
    for (const limit of ["-1", "0", String(DB_LIST_MAX_LIMIT + 1), "10e2"]) {
      expect(dbListQuerySchema.safeParse({ limit }).success).toBe(false);
    }
  });

  it("accepts every object status a client may list", () => {
    for (const status of ["pending", "active", "deleted"]) {
      expect(dbListQuerySchema.parse({ status })).toMatchObject({ status });
    }
    expect(dbListQuerySchema.safeParse({ status: "purging" }).success).toBe(
      false,
    );
  });

  it("trims search and omits blank text filters", () => {
    expect(dbListQuerySchema.parse({ search: "  invoice " })).toMatchObject({
      search: "invoice",
    });
    expect(
      dbListQuerySchema.parse({ search: "  ", contentType: "", cursor: " " }),
    ).toEqual({ limit: DEFAULT_LIST_LIMIT });
    expect(
      dbListQuerySchema.safeParse({ search: "a".repeat(256) }).success,
    ).toBe(false);
  });

  it("reads sort as JSON from a query string or as an object", () => {
    const sort = { field: "updatedAt", direction: "asc" } as const;
    expect(
      dbListQuerySchema.parse({ sort: JSON.stringify(sort) }),
    ).toMatchObject({ sort });
    expect(dbListQuerySchema.parse({ sort })).toMatchObject({ sort });
  });

  it("rejects an unknown sort field, a missing direction, and bad JSON", () => {
    expect(
      dbListQuerySchema.safeParse({
        sort: JSON.stringify({ field: "key", direction: "asc" }),
      }).success,
    ).toBe(false);
    expect(
      dbListQuerySchema.safeParse({ sort: { field: "size" } }).success,
    ).toBe(false);
    expect(dbListQuerySchema.safeParse({ sort: "size" }).success).toBe(false);
  });

  it("rejects the removed offset and prefix keys", () => {
    expect(dbListQuerySchema.safeParse({ offset: "0" }).success).toBe(false);
    expect(dbListQuerySchema.safeParse({ prefix: "a/" }).success).toBe(false);
  });
});

describe("dbObjectQuerySchema", () => {
  it("normalizes the key and keeps an optional bucket", () => {
    expect(dbObjectQuerySchema.parse({ key: "/a.png/" })).toEqual({
      key: "a.png",
    });
    // Whitespace is part of an S3 key, so it is refused, never trimmed.
    expect(dbObjectQuerySchema.safeParse({ key: " a.png " }).success).toBe(
      false,
    );
    expect(dbObjectQuerySchema.parse({ key: "a", bucket: "b" })).toEqual({
      key: "a",
      bucket: "b",
    });
  });

  it("rejects a missing or unsafe key", () => {
    expect(dbObjectQuerySchema.safeParse({}).success).toBe(false);
    expect(dbObjectQuerySchema.safeParse({ key: "../a" }).success).toBe(false);
  });
});

describe("dbUpdateObjectBodySchema", () => {
  it("accepts a rename, a move to a folder or the root, and attributes", () => {
    expect(
      dbUpdateObjectBodySchema.parse({ key: "a", filename: " b.txt " }),
    ).toEqual({ key: "a", filename: "b.txt" });
    expect(
      dbUpdateObjectBodySchema.parse({ key: "a", folderId: null }),
    ).toEqual({
      key: "a",
      folderId: null,
    });
    expect(
      dbUpdateObjectBodySchema.parse({ key: "a", attributes: { tag: 1 } }),
    ).toEqual({ key: "a", attributes: { tag: 1 } });
  });

  it("rejects a bad file name, non-object attributes, and unknown keys", () => {
    for (const body of [
      { key: "a", filename: "" },
      { key: "a", filename: "a\u0000b" },
      { key: "a", attributes: ["x"] },
      { key: "a", scope: "user:2" },
    ]) {
      expect(dbUpdateObjectBodySchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("folder body schemas", () => {
  it("creates under a parent, updates a folder, and deletes by id", () => {
    expect(dbCreateFolderBodySchema.parse({ name: "docs" })).toEqual({
      name: "docs",
    });
    expect(
      dbCreateFolderBodySchema.parse({ parentId: null, name: "docs" }),
    ).toEqual({ parentId: null, name: "docs" });
    expect(dbCreateFolderBodySchema.safeParse({}).success).toBe(false);
    expect(dbUpdateFolderBodySchema.parse({ id: "f1", name: "files" })).toEqual(
      {
        id: "f1",
        name: "files",
      },
    );
    expect(
      dbUpdateFolderBodySchema.parse({ id: "f1", parentId: null }),
    ).toEqual({
      id: "f1",
      parentId: null,
    });
    expect(dbDeleteFolderQuerySchema.parse({ id: "f1" })).toEqual({ id: "f1" });
    expect(dbDeleteFolderQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe("compiled schemas", () => {
  it("compile and validate like the parsers", () => {
    const list = z.compile(dbListQuerySchema, { strict: true });
    const object = z.compile(dbObjectQuerySchema, { strict: true });
    const update = z.compile(dbUpdateObjectBodySchema, { strict: true });
    const folder = z.compile(dbCreateFolderBodySchema, { strict: true });

    expect(list.validate({})).toBe(true);
    expect(list.validate({ status: "nope" })).toBe(false);
    expect(
      list.validate({
        folderId: "docs",
        search: "a",
        sort: '{"field":"updatedAt","direction":"desc"}',
      }),
    ).toBe(true);
    expect(list.validate({ sort: "{" })).toBe(false);
    expect(object.validate({ key: "a.png" })).toBe(true);
    expect(object.validate({})).toBe(false);
    expect(update.validate({ key: "a", folderId: null })).toBe(true);
    expect(update.validate({ key: "a", attributes: "x" })).toBe(false);
    expect(folder.validate({ name: "docs" })).toBe(true);
    expect(folder.validate({})).toBe(false);
  });
});
