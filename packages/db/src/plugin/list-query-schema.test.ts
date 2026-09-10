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

  it("compiles list and get query schemas", () => {
    const list = z.compile(dbListQuerySchema, { strict: true });
    const get = z.compile(dbGetQuerySchema, { strict: true });
    expect(list.validate({})).toBe(true);
    expect(list.validate({ status: "nope" })).toBe(false);
    expect(get.validate({ key: "a.png" })).toBe(true);
    expect(get.validate({})).toBe(false);
  });
});
