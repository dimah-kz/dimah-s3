import { base64UrlDecode, base64UrlEncode } from "@dimah-s3/core";
import { describe, expect, it } from "vitest";
import { sampleObject } from "@/test/fakes";
import type { DbListSortField } from "@/types/client";
import {
  decodeListCursor,
  DEFAULT_LIST_SORT,
  encodeListCursor,
  type ListCursorFilters,
} from "./list-cursor";

const filters: ListCursorFilters = {
  folderId: "docs",
  search: undefined,
  status: "active",
  route: undefined,
  contentType: undefined,
  sort: DEFAULT_LIST_SORT,
};

const object = sampleObject({
  id: "row-1",
  size: 42,
  filename: "a.txt",
  createdAt: new Date("2024-01-02T03:04:05.678Z"),
  updatedAt: new Date("2024-02-03T04:05:06.789Z"),
});

function encode(value: unknown): string {
  return base64UrlEncode(JSON.stringify(value));
}

function payload(cursor: string): Record<string, unknown> {
  return JSON.parse(
    new TextDecoder().decode(base64UrlDecode(cursor)),
  ) as Record<string, unknown>;
}

function sortedBy(field: DbListSortField): ListCursorFilters {
  return { ...filters, sort: { field, direction: "asc" } };
}

describe("list cursor", () => {
  it.each([
    ["createdAt", object.createdAt],
    ["updatedAt", object.updatedAt],
    ["size", 42],
    ["filename", "a.txt"],
  ] as const)("round-trips the %s position", (field, value) => {
    const cursor = encodeListCursor(sortedBy(field), object);
    expect(cursor).toMatch(/^[\w-]+$/);
    expect(decodeListCursor(cursor, sortedBy(field))).toEqual({
      value,
      id: "row-1",
    });
  });

  it("round-trips a row with no size", () => {
    const cursor = encodeListCursor(sortedBy("size"), {
      ...object,
      size: null,
    });
    expect(decodeListCursor(cursor, sortedBy("size"))).toEqual({
      value: null,
      id: "row-1",
    });
  });

  it.each<[string, Partial<ListCursorFilters>]>([
    ["folder", { folderId: "other" }],
    ["flat listing", { folderId: undefined }],
    ["root", { folderId: null }],
    ["search", { search: "a" }],
    ["status", { status: "pending" }],
    ["route", { route: "avatars" }],
    ["content type", { contentType: "image/png" }],
    ["sort field", { sort: { field: "updatedAt", direction: "desc" } }],
    ["sort direction", { sort: { field: "createdAt", direction: "asc" } }],
  ])("is ignored when the %s changes", (_, change) => {
    const cursor = encodeListCursor(filters, object);
    expect(decodeListCursor(cursor, filters)).not.toBeNull();
    expect(decodeListCursor(cursor, { ...filters, ...change })).toBeNull();
  });

  it("rejects malformed cursors", () => {
    const valid = payload(encodeListCursor(filters, object));
    for (const cursor of [
      "",
      "%%%",
      base64UrlEncode("not json"),
      encode(null),
      encode([]),
      encode({ ...valid, i: "" }),
      encode({ ...valid, i: 1 }),
      encode({ ...valid, v: "yesterday" }),
      encode({ ...valid, v: 1 }),
    ]) {
      expect(decodeListCursor(cursor, filters)).toBeNull();
    }
    expect(decodeListCursor(encode(valid), filters)).not.toBeNull();
  });

  it("rejects a size that is not a byte count", () => {
    const bySize = sortedBy("size");
    const valid = payload(encodeListCursor(bySize, object));
    for (const v of ["1", -1, 1.5]) {
      expect(decodeListCursor(encode({ ...valid, v }), bySize)).toBeNull();
    }
  });
});
