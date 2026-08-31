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
import {
  metadataSchema,
  objectKeySchema,
  optionalTrimmedString,
  partNumberSchema,
  trimmedString,
} from "./shared";
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
  it("omits missing, empty, and whitespace-only values", () => {
    expect(optionalTrimmedString.parse(undefined)).toBeUndefined();
    expect(optionalTrimmedString.parse("")).toBeUndefined();
    expect(optionalTrimmedString.parse("   ")).toBeUndefined();
    expect(optionalTrimmedString.parse(" image/png ")).toBe("image/png");
  });
});

describe("uploadBodySchema", () => {
  it("requires route, fileName, and fileSize", () => {
    expect(uploadBodySchema.safeParse({}).success).toBe(false);
    expect(uploadBodySchema.safeParse({ route: "uploads" }).success).toBe(
      false,
    );
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

  it("rejects a non-integer fileSize", () => {
    expect(
      uploadBodySchema.safeParse({ ...uploadBody, fileSize: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects a client key, bucket, acl, or expiresIn", () => {
    expect(
      uploadBodySchema.safeParse({
        ...uploadBody,
        key: "a.png",
      }).success,
    ).toBe(false);
    expect(
      uploadBodySchema.safeParse({
        ...uploadBody,
        bucket: "other",
        acl: "public-read",
        expiresIn: 600,
      }).success,
    ).toBe(false);
  });

  it("omits a blank contentType", () => {
    expect(
      uploadBodySchema.parse({ ...uploadBody, contentType: "" }).contentType,
    ).toBeUndefined();
  });
});

describe("confirmBodySchema", () => {
  it("requires route and key", () => {
    expect(confirmBodySchema.safeParse({ key: "a.png" }).success).toBe(false);
    expect(confirmBodySchema.parse({ route: "uploads", key: "a.png" })).toEqual(
      {
        route: "uploads",
        key: "a.png",
      },
    );
  });
});

describe("downloadQuerySchema", () => {
  it("requires route and key", () => {
    expect(downloadQuerySchema.safeParse({ key: "a.png" }).success).toBe(false);
    expect(
      downloadQuerySchema.parse({ route: "uploads", key: "a.png" }),
    ).toMatchObject({ route: "uploads", key: "a.png" });
  });

  it("rejects unknown query keys", () => {
    expect(
      downloadQuerySchema.safeParse({
        route: "uploads",
        key: "a.png",
        bucket: "other",
      }).success,
    ).toBe(false);
  });
});

describe("deleteQuerySchema", () => {
  it("requires route and key", () => {
    expect(deleteQuerySchema.safeParse({ key: "a.png" }).success).toBe(false);
    expect(deleteQuerySchema.parse({ route: "uploads", key: "a.png" })).toEqual(
      {
        route: "uploads",
        key: "a.png",
      },
    );
  });
});

describe("multipart schemas", () => {
  it("requires the same fields as upload on init", () => {
    expect(multipartInitBodySchema.parse(uploadBody)).toEqual(uploadBody);
  });

  it("requires a positive partNumber and partSize", () => {
    expect(
      multipartSignPartBodySchema.safeParse({
        route: "uploads",
        key: "a.png",
        uploadId: "u",
        partNumber: 0,
      }).success,
    ).toBe(false);
    expect(
      multipartSignPartBodySchema.safeParse({
        route: "uploads",
        key: "a.png",
        uploadId: "u",
        partNumber: 1,
      }).success,
    ).toBe(false);
    expect(
      multipartSignPartBodySchema.safeParse({
        route: "uploads",
        key: "a.png",
        uploadId: "u",
        partNumber: 10_001,
        partSize: 8,
      }).success,
    ).toBe(false);
    expect(
      multipartSignPartBodySchema.parse({
        route: "uploads",
        key: "a.png",
        uploadId: "u",
        partNumber: 1,
        partSize: 8,
      }),
    ).toEqual({
      route: "uploads",
      key: "a.png",
      uploadId: "u",
      partNumber: 1,
      partSize: 8,
    });
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

describe("objectKeySchema", () => {
  it("normalizes slashes and rejects parent segments", () => {
    expect(objectKeySchema.parse("/uploads/a.png/")).toBe("uploads/a.png");
    expect(objectKeySchema.safeParse("../secret").success).toBe(false);
    expect(objectKeySchema.safeParse("a/../b").success).toBe(false);
  });
});

describe("metadataSchema", () => {
  it("accepts http-header-safe keys", () => {
    expect(metadataSchema.parse({ source: "web" })).toEqual({ source: "web" });
  });

  it("rejects empty keys and oversized maps", () => {
    expect(metadataSchema.safeParse({ "": "x" }).success).toBe(false);
    expect(metadataSchema.safeParse({ "has space": "x" }).success).toBe(false);
  });
});

describe("partNumberSchema", () => {
  it("allows 1 through 10000", () => {
    expect(partNumberSchema.parse(1)).toBe(1);
    expect(partNumberSchema.parse(10_000)).toBe(10_000);
    expect(partNumberSchema.safeParse(0).success).toBe(false);
    expect(partNumberSchema.safeParse(10_001).success).toBe(false);
  });
});
