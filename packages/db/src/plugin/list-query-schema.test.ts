import { describe, expect, it } from "vitest";
import { dbListQuerySchema } from "./list-query-schema";

describe("dbListQuerySchema", () => {
  it("accepts empty query", () => {
    expect(dbListQuerySchema.parse({})).toEqual({});
  });

  it("coerces pagination from strings", () => {
    expect(
      dbListQuerySchema.parse({ status: "active", limit: "10", offset: "2" }),
    ).toEqual({ status: "active", limit: 10, offset: 2 });
  });

  it("rejects invalid status and negative paging", () => {
    expect(dbListQuerySchema.safeParse({ status: "nope" }).success).toBe(false);
    expect(dbListQuerySchema.safeParse({ limit: "-1" }).success).toBe(false);
  });
});
