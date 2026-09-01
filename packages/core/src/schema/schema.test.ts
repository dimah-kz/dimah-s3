import { describe, expect, it } from "vitest";
import * as z from "zod";
import { deleteBatchBodySchema, deleteQuerySchema } from "./delete";
import { downloadQuerySchema } from "./download";
import { fileQuerySchema } from "./file";
import { routeCatalogResponseSchema } from "./catalog";
import { s3FetchErrorSchema } from "./error";
import {
  multipartAbortBodySchema,
  multipartCompleteBodySchema,
  multipartCompletedPartSchema,
  multipartInitBodySchema,
  multipartListPartsQuerySchema,
  multipartSignPartBodySchema,
} from "./multipart";
import {
  metadataSchema,
  objectKeySchema,
  optionalChecksumSchema,
  optionalTrimmedString,
  partNumberSchema,
  sha256ChecksumSchema,
  trimmedString,
} from "./shared";
import { confirmBodySchema, uploadBodySchema } from "./upload";

const uploadBody = {
  route: "uploads",
  fileName: "a.png",
  fileSize: 10,
};

/** SHA-256("hi") as unpadded standard base64. */
const SHA256_HI = "j0NDRmSPa5bfid2pAcUXaxCm2Dlh3TwayItZstwyeqQ";

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
    expect(z.validate(s3FetchErrorSchema, { code: "X" })).toBe(false);
    expect(z.validate(s3FetchErrorSchema, "not json")).toBe(false);
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

  it("accepts an optional SHA-256 checksum", () => {
    expect(
      uploadBodySchema.parse({ ...uploadBody, checksum: SHA256_HI }).checksum,
    ).toBe(SHA256_HI);
    expect(
      uploadBodySchema.parse({
        ...uploadBody,
        checksum: `${SHA256_HI}=`,
      }).checksum,
    ).toBe(`${SHA256_HI}=`);
  });

  it("rejects a checksum that is not SHA-256 base64", () => {
    expect(
      z.validate(uploadBodySchema, { ...uploadBody, checksum: "abc" }),
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

  it("accepts disposition", () => {
    expect(
      downloadQuerySchema.parse({
        route: "uploads",
        key: "a.png",
        disposition: "inline",
      }).disposition,
    ).toBe("inline");
  });
});

describe("fileQuerySchema", () => {
  it("requires route and key", () => {
    expect(
      fileQuerySchema.parse({ route: "uploads", key: "a.png" }),
    ).toMatchObject({ route: "uploads", key: "a.png" });
  });
});

describe("routeCatalogResponseSchema", () => {
  it("accepts a mixed catalog", () => {
    expect(
      routeCatalogResponseSchema.parse({
        routes: {
          uploads: {
            upload: {
              enabled: true,
              fileTypes: ["image/*"],
              multipart: true,
            },
            download: { enabled: false },
            delete: { enabled: true },
          },
        },
      }),
    ).toMatchObject({
      routes: { uploads: { upload: { enabled: true, multipart: true } } },
    });
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

describe("deleteBatchBodySchema", () => {
  it("requires 1–100 keys", () => {
    expect(
      deleteBatchBodySchema.parse({
        route: "uploads",
        keys: ["uploads/a.png"],
      }),
    ).toEqual({ route: "uploads", keys: ["uploads/a.png"] });
    expect(
      deleteBatchBodySchema.safeParse({ route: "uploads", keys: [] }).success,
    ).toBe(false);
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
    expect(z.validate(partNumberSchema, 0)).toBe(false);
    expect(z.validate(partNumberSchema, 10_001)).toBe(false);
  });
});

describe("sha256ChecksumSchema", () => {
  it("accepts padded and unpadded SHA-256 base64", () => {
    expect(sha256ChecksumSchema.parse(SHA256_HI)).toBe(SHA256_HI);
    expect(sha256ChecksumSchema.parse(`${SHA256_HI}=`)).toBe(`${SHA256_HI}=`);
    expect(z.validate(sha256ChecksumSchema, "abc")).toBe(false);
  });

  it("omits a blank optional checksum", () => {
    expect(optionalChecksumSchema.parse("")).toBeUndefined();
    expect(optionalChecksumSchema.parse("   ")).toBeUndefined();
    expect(optionalChecksumSchema.parse(SHA256_HI)).toBe(SHA256_HI);
  });
});

describe("z.compile", () => {
  it("compiles every protocol schema", () => {
    const schemas = [
      trimmedString,
      optionalTrimmedString,
      objectKeySchema,
      partNumberSchema,
      metadataSchema,
      sha256ChecksumSchema,
      optionalChecksumSchema,
      uploadBodySchema,
      confirmBodySchema,
      downloadQuerySchema,
      fileQuerySchema,
      deleteQuerySchema,
      deleteBatchBodySchema,
      multipartInitBodySchema,
      multipartSignPartBodySchema,
      multipartListPartsQuerySchema,
      multipartCompletedPartSchema,
      multipartCompleteBodySchema,
      multipartAbortBodySchema,
      routeCatalogResponseSchema,
      s3FetchErrorSchema,
    ];
    for (const schema of schemas) {
      expect(() => z.compile(schema, { strict: true })).not.toThrow();
    }
  });
});
