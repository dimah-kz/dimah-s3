import { describe, expect, it } from "vitest";
import {
  DimahS3DbError,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from "./errors";

describe("DimahS3DbError", () => {
  it.each([
    [unauthorized, 401, "UNAUTHORIZED"],
    [forbidden, 403, "FORBIDDEN"],
    [notFound, 404, "NOT_FOUND"],
    [conflict, 409, "CONFLICT"],
  ] as const)("%s maps to %s / %s", (factory, status, code) => {
    const err = factory();
    expect(err).toBeInstanceOf(DimahS3DbError);
    expect(err.status).toBe(status);
    expect(err.code).toBe(code);
  });

  it("keeps custom messages", () => {
    expect(forbidden("nope").message).toBe("nope");
  });
});
