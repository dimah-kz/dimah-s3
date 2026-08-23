import { describe, expect, it } from "vitest";
import { resolveRequestAcl } from "./resolve-request-acl";

describe("resolveRequestAcl", () => {
  it("defaults to private", () => {
    expect(resolveRequestAcl(undefined, "public-read")).toBe("private");
    expect(resolveRequestAcl({}, "public-read")).toBe("private");
  });

  it("honors a client ACL when allowClientAcl is set", () => {
    expect(resolveRequestAcl({ allowClientAcl: true }, "public-read")).toBe(
      "public-read",
    );
  });

  it("lets a server ACL win", () => {
    expect(
      resolveRequestAcl(
        { acl: "public-read", allowClientAcl: true },
        "private",
      ),
    ).toBe("public-read");
  });
});
