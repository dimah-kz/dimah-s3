import { describe, expect, it } from "vitest";
import {
  DB_LIST_DEFAULT_LIMIT,
  DB_LIST_MAX_LIMIT,
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

  it("rejects invalid status, zero, and oversized limits", () => {
    expect(dbListQuerySchema.safeParse({ status: "nope" }).success).toBe(false);
    expect(dbListQuerySchema.safeParse({ limit: "-1" }).success).toBe(false);
    expect(dbListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(
      dbListQuerySchema.safeParse({ limit: String(DB_LIST_MAX_LIMIT + 1) })
        .success,
    ).toBe(false);
  });
});
