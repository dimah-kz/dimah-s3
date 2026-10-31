import { describe, expect, it } from "vitest";
import { sampleFolder, sampleObject } from "@/test/fakes";
import { toDbClientFolder, toDbClientObject } from "./to-db-client-object";

describe("toDbClientObject", () => {
  it("maps to the browser wire shape and drops server-only fields", () => {
    const wire = toDbClientObject(
      sampleObject({
        folder: "docs",
        s3Metadata: { "dimah-upload": "t" },
        updatedAt: new Date("2024-02-01T00:00:00.000Z"),
      }),
    );

    expect(wire).toEqual({
      id: "1",
      bucket: "b",
      key: "k",
      route: "uploads",
      folder: "docs",
      filename: "a.txt",
      contentType: "text/plain",
      size: 10,
      declaredSize: null,
      status: "active",
      attributes: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-02-01T00:00:00.000Z",
    });
    for (const field of [
      "scope",
      "eTag",
      "s3Metadata",
      "acl",
      "uploadId",
      "uploadToken",
      "expiresAt",
    ]) {
      expect(wire).not.toHaveProperty(field);
    }
  });

  it("passes stored attributes through without toClient", () => {
    const wire = toDbClientObject(
      sampleObject({ attributes: { title: "Q4", internal: "x" } }),
    );

    expect(wire.attributes).toEqual({ title: "Q4", internal: "x" });
  });

  it("maps attributes with toClient and keeps null as null", () => {
    const toClient = ({ title }: { title: string; internal: string }) => ({
      title,
    });

    expect(
      toDbClientObject(
        sampleObject({ attributes: { title: "Q4", internal: "x" } }),
        toClient,
      ).attributes,
    ).toEqual({ title: "Q4" });
    expect(toDbClientObject(sampleObject(), toClient).attributes).toBeNull();
  });
});

describe("toDbClientFolder", () => {
  it("maps a folder row to the browser wire shape", () => {
    const wire = toDbClientFolder(
      sampleFolder({ path: "docs/q4", parent: "docs", name: "q4" }),
    );

    expect(wire).toEqual({
      path: "docs/q4",
      name: "q4",
      parent: "docs",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });
});
