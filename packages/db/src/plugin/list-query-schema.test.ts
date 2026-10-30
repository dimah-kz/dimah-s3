import { describe, expect, it } from "vitest";
import * as z from "zod";
import {
  DB_LIST_DEFAULT_LIMIT,
  DB_LIST_MAX_LIMIT,
  dbGetQuerySchema,
  dbListQuerySchema,
} from "./list-query-schema";

describe("dbListQuerySchema", () => {
  it("defaults limit when the query is empty", () => {
    expect(dbListQuerySchema.parse({})).toEqual({
      limit: DB_LIST_DEFAULT_LIMIT,
    });
  });

  it("coerces pagination from strings", () => {
    expect(
      dbListQuerySchema.parse({ status: "active", limit: "10", offset: "2" }),
    ).toEqual({ status: "active", limit: 10, offset: 2 });
  });

  it("accepts numeric pagination from s3.api", () => {
    expect(dbListQuerySchema.parse({ limit: 10, offset: 0 })).toEqual({
      limit: 10,
      offset: 0,
    });
  });

  it("rejects invalid status, zero, and oversized limits", () => {
    expect(dbListQuerySchema.validate({ status: "nope" })).toBe(false);
    expect(dbListQuerySchema.validate({ limit: "-1" })).toBe(false);
    expect(dbListQuerySchema.validate({ limit: "0" })).toBe(false);
    expect(
      dbListQuerySchema.validate({ limit: String(DB_LIST_MAX_LIMIT + 1) }),
    ).toBe(false);
    expect(dbListQuerySchema.validate({ limit: "10e2" })).toBe(false);
  });

  it("trims search and rejects a blank one", () => {
    expect(dbListQuerySchema.parse({ search: "  invoice " })).toMatchObject({
      search: "invoice",
    });
    expect(dbListQuerySchema.validate({ search: "   " })).toBe(false);
  });

  it("reads sort as JSON from a query string or as an object", () => {
    const sort = { field: "size", direction: "asc" } as const;
    expect(
      dbListQuerySchema.parse({ sort: JSON.stringify(sort) }),
    ).toMatchObject({ sort });
    expect(dbListQuerySchema.parse({ sort })).toMatchObject({ sort });
  });

  it("rejects an unknown sort field, a missing direction, and bad JSON", () => {
    expect(
      dbListQuerySchema.validate({
        sort: JSON.stringify({ field: "key", direction: "asc" }),
      }),
    ).toBe(false);
    expect(
      dbListQuerySchema.validate({ sort: { field: "size" } as never }),
    ).toBe(false);
    expect(dbListQuerySchema.validate({ sort: "size" })).toBe(false);
  });

  it("compiles list and get query schemas", () => {
    const list = z.compile(dbListQuerySchema, { strict: true });
    const get = z.compile(dbGetQuerySchema, { strict: true });
    expect(list.validate({})).toBe(true);
    expect(list.validate({ status: "nope" })).toBe(false);
    expect(
      list.validate({
        search: "a",
        sort: '{"field":"filename","direction":"desc"}',
      }),
    ).toBe(true);
    expect(list.validate({ sort: "{" })).toBe(false);
    expect(get.validate({ key: "a.png" })).toBe(true);
    expect(get.validate({})).toBe(false);
  });
});
