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
    expect(s3FetchErrorSchema.validate({ code: "X" })).toBe(false);
    expect(s3FetchErrorSchema.validate("not json")).toBe(false);
  });
});

describe("trimmedString", () => {
  it("trims and rejects empty values", () => {
    expect(trimmedString.parse("  key  ")).toBe("key");
    expect(trimmedString.validate("   ")).toBe(false);
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
    expect(uploadBodySchema.validate({})).toBe(false);
    expect(uploadBodySchema.validate({ route: "uploads" })).toBe(false);
    expect(uploadBodySchema.parse(uploadBody)).toMatchObject(uploadBody);
  });

  it("rejects invalid route names", () => {
    expect(uploadBodySchema.validate({ ...uploadBody, route: "1bad" })).toBe(
      false,
    );
    expect(
      uploadBodySchema.validate({ ...uploadBody, route: "has space" }),
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
    expect(uploadBodySchema.validate({ ...uploadBody, fileSize: 1.5 })).toBe(
      false,
    );
  });

  it("rejects a client key, bucket, acl, or expiresIn", () => {
    expect(uploadBodySchema.validate({ ...uploadBody, key: "a.png" })).toBe(
      false,
    );
    expect(
      uploadBodySchema.validate({
        ...uploadBody,
        bucket: "other",
        acl: "public-read",
        expiresIn: 600,
      }),
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
    expect(uploadBodySchema.validate({ ...uploadBody, checksum: "abc" })).toBe(
      false,
    );
  });

  it("omits a blank contentType", () => {
    expect(
      uploadBodySchema.parse({ ...uploadBody, contentType: "" }).contentType,
    ).toBeUndefined();
  });
});

describe("confirmBodySchema", () => {
  it("requires route and key", () => {
    expect(confirmBodySchema.validate({ key: "a.png" })).toBe(false);
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
    expect(downloadQuerySchema.validate({ key: "a.png" })).toBe(false);
    expect(
      downloadQuerySchema.parse({ route: "uploads", key: "a.png" }),
    ).toMatchObject({ route: "uploads", key: "a.png" });
  });

  it("rejects unknown query keys", () => {
    expect(
      downloadQuerySchema.validate({
        route: "uploads",
        key: "a.png",
        bucket: "other",
      }),
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
    expect(deleteQuerySchema.validate({ key: "a.png" })).toBe(false);
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
    expect(deleteBatchBodySchema.validate({ route: "uploads", keys: [] })).toBe(
      false,
    );
  });
});

describe("multipart schemas", () => {
  it("requires the same fields as upload on init", () => {
    expect(multipartInitBodySchema.parse(uploadBody)).toEqual(uploadBody);
  });

  it("requires a positive partNumber and partSize", () => {
    expect(
      multipartSignPartBodySchema.validate({
        route: "uploads",
        key: "a.png",
        uploadId: "u",
        partNumber: 0,
      }),
    ).toBe(false);
    expect(
      multipartSignPartBodySchema.validate({
        route: "uploads",
        key: "a.png",
        uploadId: "u",
        partNumber: 1,
      }),
    ).toBe(false);
    expect(
      multipartSignPartBodySchema.validate({
        route: "uploads",
        key: "a.png",
        uploadId: "u",
        partNumber: 10_001,
        partSize: 8,
      }),
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
      multipartCompleteBodySchema.validate({
        route: "uploads",
        key: "a.png",
        uploadId: "u",
        parts: [],
      }),
    ).toBe(false);
  });

  it("requires uploadId on abort and list-parts", () => {
    expect(
      multipartAbortBodySchema.validate({
        route: "uploads",
        key: "a.png",
      }),
    ).toBe(false);
    expect(
      multipartListPartsQuerySchema.validate({
        route: "uploads",
        key: "a.png",
      }),
    ).toBe(false);
  });
});

describe("objectKeySchema", () => {
  it("normalizes slashes and rejects parent segments", () => {
    expect(objectKeySchema.parse("/uploads/a.png/")).toBe("uploads/a.png");
    expect(objectKeySchema.validate("../secret")).toBe(false);
    expect(objectKeySchema.validate("a/../b")).toBe(false);
  });
});

describe("metadataSchema", () => {
  it("accepts http-header-safe keys", () => {
    expect(metadataSchema.parse({ source: "web" })).toEqual({ source: "web" });
  });

  it("rejects empty keys and oversized maps", () => {
    expect(metadataSchema.validate({ "": "x" })).toBe(false);
    expect(metadataSchema.validate({ "has space": "x" })).toBe(false);
  });
});

describe("partNumberSchema", () => {
  it("allows 1 through 10000", () => {
    expect(partNumberSchema.parse(1)).toBe(1);
    expect(partNumberSchema.parse(10_000)).toBe(10_000);
    expect(partNumberSchema.validate(0)).toBe(false);
    expect(partNumberSchema.validate(10_001)).toBe(false);
  });
});

describe("sha256ChecksumSchema", () => {
  it("accepts padded and unpadded SHA-256 base64", () => {
    expect(sha256ChecksumSchema.parse(SHA256_HI)).toBe(SHA256_HI);
    expect(sha256ChecksumSchema.parse(`${SHA256_HI}=`)).toBe(`${SHA256_HI}=`);
    expect(sha256ChecksumSchema.validate("abc")).toBe(false);
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

  it("compiled schemas validate without building a parse result", () => {
    const compiled = z.compile(uploadBodySchema, { strict: true });
    expect(compiled.validate(uploadBody)).toBe(true);
    expect(compiled.validate({})).toBe(false);
  });
});
