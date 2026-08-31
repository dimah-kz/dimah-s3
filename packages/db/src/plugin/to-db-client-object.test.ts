import { describe, expect, it } from "vitest";
import { toDbClientObject } from "./to-db-client-object";
import { sampleObject } from "@/test/fakes";

describe("toDbClientObject", () => {
  it("maps to the browser wire shape and drops server-only fields", () => {
    const wire = toDbClientObject(sampleObject());
    expect(wire).toEqual({
      id: "1",
      bucket: "b",
      key: "k",
      route: "uploads",
      filename: "a.txt",
      contentType: "text/plain",
      size: 10,
      declaredSize: null,
      status: "active",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    expect(wire).not.toHaveProperty("scope");
    expect(wire).not.toHaveProperty("eTag");
    expect(wire).not.toHaveProperty("acl");
  });
});
