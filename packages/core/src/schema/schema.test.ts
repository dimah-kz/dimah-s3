import { describe, expect, it } from "vitest";
import { deleteQuerySchema } from "./delete";
import { downloadQuerySchema } from "./download";
import {
  multipartCompleteBodySchema,
  multipartSignPartBodySchema,
} from "./multipart";
import { optionalTrimmedString, trimmedString } from "./shared";
import { confirmBodySchema, uploadBodySchema } from "./upload";

describe("trimmedString", () => {
  it("trims and rejects empty values", () => {
    expect(trimmedString.parse("  key  ")).toBe("key");
    expect(trimmedString.safeParse("   ").success).toBe(false);
  });
});

describe("optionalTrimmedString", () => {
  it("accepts omitted values and rejects blank strings", () => {
    expect(optionalTrimmedString.parse(undefined)).toBeUndefined();
    expect(optionalTrimmedString.safeParse("").success).toBe(false);
  });
});

describe("uploadBodySchema", () => {
  it("requires a non-empty key", () => {
    expect(uploadBodySchema.safeParse({}).success).toBe(false);
    expect(uploadBodySchema.parse({ key: " a.png " })).toMatchObject({
      key: "a.png",
    });
  });

  it("accepts optional metadata, acl, and size", () => {
    expect(
      uploadBodySchema.parse({
        key: "a.png",
        fileSize: 10,
        acl: "private",
        metadata: { source: "web" },
      }),
    ).toMatchObject({
      fileSize: 10,
      acl: "private",
      metadata: { source: "web" },
    });
  });
});

describe("confirmBodySchema", () => {
  it("requires key", () => {
    expect(confirmBodySchema.safeParse({ bucket: "b" }).success).toBe(false);
    expect(confirmBodySchema.parse({ key: "a.png", bucket: "b" })).toEqual({
      key: "a.png",
      bucket: "b",
    });
  });
});

describe("downloadQuerySchema", () => {
  it("coerces expiresIn from query strings", () => {
    expect(
      downloadQuerySchema.parse({ key: "a.png", expiresIn: "120" }),
    ).toMatchObject({ expiresIn: 120 });
  });
});

describe("deleteQuerySchema", () => {
  it("requires key", () => {
    expect(deleteQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe("multipart schemas", () => {
  it("requires a positive partNumber", () => {
    expect(
      multipartSignPartBodySchema.safeParse({
        key: "a.png",
        uploadId: "u",
        partNumber: 0,
      }).success,
    ).toBe(false);
  });

  it("requires at least one part to complete", () => {
    expect(
      multipartCompleteBodySchema.safeParse({
        key: "a.png",
        uploadId: "u",
        parts: [],
      }).success,
    ).toBe(false);
  });
});
