import { describe, expect, it } from "vitest";
import { DimahS3Error } from "@dimah-s3/core";
import { conflict, forbidden, notFound, unauthorized } from "./errors";

describe("db errors", () => {
  it.each([
    [unauthorized, 401, "UNAUTHORIZED"],
    [forbidden, 403, "FORBIDDEN"],
    [notFound, 404, "NOT_FOUND"],
    [conflict, 409, "CONFLICT"],
  ] as const)("%s maps to %s / %s", (factory, statusCode, code) => {
    const err = factory();
    expect(err).toBeInstanceOf(DimahS3Error);
    expect(err.statusCode).toBe(statusCode);
    expect(err.code).toBe(code);
  });

  it("keeps custom messages", () => {
    expect(forbidden("nope").message).toBe("nope");
  });
});
