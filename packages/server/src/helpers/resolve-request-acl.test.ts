import { describe, expect, it } from "vitest";
import { resolveRequestAcl } from "./resolve-request-acl";

describe("resolveRequestAcl", () => {
  it("defaults to private", () => {
    expect(resolveRequestAcl(undefined)).toBe("private");
    expect(resolveRequestAcl({})).toBe("private");
  });

  it("uses a server ACL when set", () => {
    expect(resolveRequestAcl({ acl: "public-read" })).toBe("public-read");
  });
});
