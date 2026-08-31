import { describe, expect, it } from "vitest";
import { deleteQuerySchema } from "./delete";
import { downloadQuerySchema } from "./download";
import { s3FetchErrorSchema } from "./error";
import {
  multipartAbortBodySchema,
  multipartCompleteBodySchema,
  multipartInitBodySchema,
  multipartListPartsQuerySchema,
  multipartSignPartBodySchema,
} from "./multipart";
import { optionalTrimmedString, trimmedString } from "./shared";
import { confirmBodySchema, uploadBodySchema } from "./upload";

const uploadBody = {
  route: "uploads",
  fileName: "a.png",
  fileSize: 10,
};

describe("s3FetchErrorSchema", () => {
  it("accepts the API error JSON body", () => {
    expect(
      s3FetchErrorSchema.parse({
        message: "blocked",
        code: "FORBIDDEN",
        params: { name: "key" },
      }),
    ).toEqual({
      message: "blocked",
      code: "FORBIDDEN",
      params: { name: "key" },
    });
  });

  it("requires message and rejects non-objects", () => {
    expect(s3FetchErrorSchema.safeParse({ code: "X" }).success).toBe(false);
    expect(s3FetchErrorSchema.safeParse("not json").success).toBe(false);
  });
});

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
  it("requires route, fileName, and fileSize", () => {
    expect(uploadBodySchema.safeParse({}).success).toBe(false);
    expect(uploadBodySchema.safeParse({ route: "uploads" }).success).toBe(false);
    expect(uploadBodySchema.parse(uploadBody)).toMatchObject(uploadBody);
  });

  it("rejects invalid route names", () => {
    expect(
      uploadBodySchema.safeParse({ ...uploadBody, route: "1bad" }).success,
    ).toBe(false);
    expect(
      uploadBodySchema.safeParse({ ...uploadBody, route: "has space" }).success,
    ).toBe(false);
  });

  it("accepts optional metadata and contentType", () => {
    expect(
      uploadBodySchema.parse({
        ...uploadBody,
        contentType: "image/png",
        metadata: { source: "web" },
      }),
    ).toMatchObject({
      fileSize: 10,
      metadata: { source: "web" },
    });
  });

  it("rejects a client key, bucket, acl, or expiresIn", () => {
    const parsed = uploadBodySchema.parse({
      ...uploadBody,
      key: "a.png",
      bucket: "other",
      acl: "public-read",
      expiresIn: 600,
    });
    expect(parsed).not.toHaveProperty("key");
    expect(parsed).not.toHaveProperty("bucket");
    expect(parsed).not.toHaveProperty("acl");
    expect(parsed).not.toHaveProperty("expiresIn");
  });
});

describe("confirmBodySchema", () => {
  it("requires route and key", () => {
    expect(confirmBodySchema.safeParse({ key: "a.png" }).success).toBe(false);
    expect(confirmBodySchema.parse({ route: "uploads", key: "a.png" })).toEqual({
      route: "uploads",
      key: "a.png",
    });
  });
});

describe("downloadQuerySchema", () => {
  it("requires route and key", () => {
    expect(downloadQuerySchema.safeParse({ key: "a.png" }).success).toBe(false);
    expect(
      downloadQuerySchema.parse({ route: "uploads", key: "a.png" }),
    ).toMatchObject({ route: "uploads", key: "a.png" });
  });
});

describe("deleteQuerySchema", () => {
  it("requires route and key", () => {
    expect(deleteQuerySchema.safeParse({ key: "a.png" }).success).toBe(false);
    expect(deleteQuerySchema.parse({ route: "uploads", key: "a.png" })).toEqual({
      route: "uploads",
      key: "a.png",
    });
  });
});

describe("multipart schemas", () => {
  it("requires the same fields as upload on init", () => {
    expect(multipartInitBodySchema.parse(uploadBody)).toEqual(uploadBody);
  });

  it("requires a positive partNumber", () => {
    expect(
      multipartSignPartBodySchema.safeParse({
        route: "uploads",
        key: "a.png",
        uploadId: "u",
        partNumber: 0,
      }).success,
    ).toBe(false);
  });

  it("requires at least one part to complete", () => {
    expect(
      multipartCompleteBodySchema.safeParse({
        route: "uploads",
        key: "a.png",
        uploadId: "u",
        parts: [],
      }).success,
    ).toBe(false);
  });

  it("requires uploadId on abort and list-parts", () => {
    expect(
      multipartAbortBodySchema.safeParse({
        route: "uploads",
        key: "a.png",
      }).success,
    ).toBe(false);
    expect(
      multipartListPartsQuerySchema.safeParse({
        route: "uploads",
        key: "a.png",
      }).success,
    ).toBe(false);
  });
});
