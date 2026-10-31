import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod";
import type {
  ConfirmPayload,
  MultipartTicketPayload,
  S3RequestOptions,
  UploadPayload,
} from "@/types/requests";
import type { S3Api } from "@/types/responses";
import {
  DELETE_MANY_MAX_KEYS,
  deleteManyBodySchema,
  deleteQuerySchema,
} from "./delete";
import { downloadQuerySchema } from "./download";
import { fileQuerySchema } from "./file";
import { routeCatalogResponseSchema } from "./catalog";
import { s3FetchErrorSchema } from "./error";
import {
  multipartInitBodySchema,
  multipartSignPartBodySchema,
  multipartTicketBodySchema,
} from "./multipart";
import {
  contentTypeSchema,
  fileNameSchema,
  metadataSchema,
  objectKeySchema,
  optionalChecksumSchema,
  optionalTrimmedString,
  partNumberSchema,
  S3_DEFAULT_PART_SIZE,
  S3_MAX_OBJECT_SIZE,
  S3_MAX_PART_SIZE,
  S3_MIN_PART_SIZE,
  sha256ChecksumSchema,
  trimmedString,
  uploadTicketSchema,
} from "./shared";
import { confirmBodySchema, uploadBodySchema } from "./upload";

const uploadBody = {
  route: "uploads",
  name: "a.png",
  size: 10,
};

/** SHA-256("hi") as unpadded standard base64. */
const SHA256_HI = "j0NDRmSPa5bfid2pAcUXaxCm2Dlh3TwayItZstwyeqQ";

/** "é" is 2 UTF-8 bytes, so 127 of them plus "a" is exactly 255 bytes. */
const NAME_255_BYTES = `${"é".repeat(127)}a`;
const NAME_256_BYTES = "é".repeat(128);

const TICKET = "v1.eyJpZCI6IngifQ.c2lnbmF0dXJl";

function base64Url(value: string | Uint8Array): string {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

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

  it("requires code and message, and rejects non-objects", () => {
    expect(s3FetchErrorSchema.validate({ code: "X" })).toBe(false);
    expect(s3FetchErrorSchema.validate({ message: "no code" })).toBe(false);
    expect(s3FetchErrorSchema.validate("not json")).toBe(false);
  });

  it("keeps code and message when a params value is not a string or number", () => {
    expect(
      s3FetchErrorSchema.parse({
        code: "QUOTA_EXCEEDED",
        message: "m",
        params: { limit: "bytes", used: 3, over: true, nested: { a: 1 } },
      }),
    ).toEqual({
      code: "QUOTA_EXCEEDED",
      message: "m",
      params: { limit: "bytes", used: 3 },
    });
    expect(
      s3FetchErrorSchema.parse({ code: "X", message: "m", params: null }),
    ).toEqual({ code: "X", message: "m" });
    expect(
      s3FetchErrorSchema.parse({ code: "X", message: "m", params: [1] }),
    ).toEqual({ code: "X", message: "m" });
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

describe("fileNameSchema", () => {
  it("trims and accepts up to 255 UTF-8 bytes", () => {
    expect(fileNameSchema.parse(" a.png ")).toBe("a.png");
    expect(fileNameSchema.parse(NAME_255_BYTES)).toBe(NAME_255_BYTES);
  });

  it("rejects an empty name and a 256-byte name", () => {
    expect(fileNameSchema.validate("  ")).toBe(false);
    expect(fileNameSchema.validate(NAME_256_BYTES)).toBe(false);
    expect(fileNameSchema.validate("a".repeat(256))).toBe(false);
  });

  it("rejects control characters", () => {
    expect(fileNameSchema.validate("a\u0001.png")).toBe(false);
    expect(fileNameSchema.validate("a\n.png")).toBe(false);
    expect(fileNameSchema.validate("a\u007f.png")).toBe(false);
    expect(fileNameSchema.validate('a "b".png')).toBe(true);
  });
});

describe("contentTypeSchema", () => {
  it("trims and caps the type at 255 UTF-8 bytes", () => {
    expect(contentTypeSchema.parse(" image/png ")).toBe("image/png");
    expect(contentTypeSchema.validate(`x/${"a".repeat(253)}`)).toBe(true);
    expect(contentTypeSchema.validate(`x/${"a".repeat(254)}`)).toBe(false);
  });

  it("rejects control characters", () => {
    expect(contentTypeSchema.validate("image/png\u0000")).toBe(false);
    expect(contentTypeSchema.validate("text/plain;\tcharset=utf-8")).toBe(
      false,
    );
  });
});

describe("uploadTicketSchema", () => {
  it("trims and accepts 1 to 8192 characters", () => {
    expect(uploadTicketSchema.parse(` ${TICKET} `)).toBe(TICKET);
    expect(uploadTicketSchema.validate("a".repeat(8192))).toBe(true);
    expect(uploadTicketSchema.validate("a".repeat(8193))).toBe(false);
    expect(uploadTicketSchema.validate("")).toBe(false);
  });

  it("fits a worst-case ticket with a 1024-byte key and a 255-byte name", async () => {
    // Largest JSON per accepted value: `"` (escaped to 2 bytes) filling the
    // key, name, and type byte caps.
    const key = '"'.repeat(1024);
    const name = '"'.repeat(255);
    const type = `x/${'"'.repeat(253)}`;
    expect(objectKeySchema.parse(key)).toBe(key);
    expect(fileNameSchema.parse(name)).toBe(name);
    expect(contentTypeSchema.parse(type)).toBe(type);

    const payload = {
      id: base64Url(randomBytes(16)),
      r: `r${"a".repeat(63)}`,
      k: key,
      m: "multipart",
      u: "u".repeat(512),
      n: name,
      s: S3_MAX_OBJECT_SIZE,
      t: type,
      ps: S3_MAX_PART_SIZE,
      pc: 10_000,
      c: 1,
      sb: base64Url(randomBytes(32)).slice(0, 22),
      iat: 1_800_000_000,
      exp: 1_800_086_400,
    };
    const payloadB64 = base64Url(JSON.stringify(payload));
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      randomBytes(32),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = base64Url(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          hmacKey,
          new TextEncoder().encode(`v1.${payloadB64}`),
        ),
      ),
    );
    const ticket = `v1.${payloadB64}.${signature}`;

    expect(ticket.length).toBeLessThan(8192);
    expect(uploadTicketSchema.parse(ticket)).toBe(ticket);
  });
});

describe("part layout constants", () => {
  it("matches the S3 multipart limits", () => {
    expect(S3_MIN_PART_SIZE).toBe(5 * 1024 * 1024);
    expect(S3_DEFAULT_PART_SIZE).toBe(8 * 1024 * 1024);
    expect(S3_MAX_PART_SIZE).toBe(5 * 1024 * 1024 * 1024);
    expect(S3_MAX_OBJECT_SIZE).toBe(5 * 1024 ** 4);
  });
});

describe("uploadBodySchema", () => {
  it("requires route, name, and size", () => {
    expect(uploadBodySchema.validate({})).toBe(false);
    expect(uploadBodySchema.validate({ route: "uploads" })).toBe(false);
    expect(uploadBodySchema.parse(uploadBody)).toEqual(uploadBody);
  });

  it("rejects the 1.x field names", () => {
    expect(
      uploadBodySchema.validate({
        route: "uploads",
        fileName: "a.png",
        fileSize: 10,
      }),
    ).toBe(false);
    expect(
      uploadBodySchema.validate({ ...uploadBody, contentType: "image/png" }),
    ).toBe(false);
  });

  it("rejects invalid route names", () => {
    expect(uploadBodySchema.validate({ ...uploadBody, route: "1bad" })).toBe(
      false,
    );
    expect(
      uploadBodySchema.validate({ ...uploadBody, route: "has space" }),
    ).toBe(false);
  });

  it("accepts optional metadata and type", () => {
    expect(
      uploadBodySchema.parse({
        ...uploadBody,
        type: "image/png",
        metadata: { source: "web" },
      }),
    ).toEqual({
      ...uploadBody,
      type: "image/png",
      metadata: { source: "web" },
    });
  });

  it("omits a blank type", () => {
    expect(
      uploadBodySchema.parse({ ...uploadBody, type: "" }).type,
    ).toBeUndefined();
    expect(
      uploadBodySchema.parse({ ...uploadBody, type: "  " }).type,
    ).toBeUndefined();
  });

  it("rejects a 256-byte name or type", () => {
    expect(
      uploadBodySchema.validate({ ...uploadBody, name: NAME_255_BYTES }),
    ).toBe(true);
    expect(
      uploadBodySchema.validate({ ...uploadBody, name: NAME_256_BYTES }),
    ).toBe(false);
    expect(
      uploadBodySchema.validate({
        ...uploadBody,
        type: `x/${"a".repeat(254)}`,
      }),
    ).toBe(false);
  });

  it("requires a non-negative integer size up to 5 TiB", () => {
    expect(uploadBodySchema.validate({ ...uploadBody, size: 1.5 })).toBe(false);
    expect(uploadBodySchema.validate({ ...uploadBody, size: -1 })).toBe(false);
    // 0 parses so the server answers FILE_EMPTY, not VALIDATION_ERROR.
    expect(uploadBodySchema.validate({ ...uploadBody, size: 0 })).toBe(true);
    expect(multipartInitBodySchema.validate({ ...uploadBody, size: 0 })).toBe(
      true,
    );
    expect(
      uploadBodySchema.validate({ ...uploadBody, size: S3_MAX_OBJECT_SIZE }),
    ).toBe(true);
    expect(
      uploadBodySchema.validate({
        ...uploadBody,
        size: S3_MAX_OBJECT_SIZE + 1,
      }),
    ).toBe(false);
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
});

describe("confirmBodySchema", () => {
  it("takes only the ticket", () => {
    expect(confirmBodySchema.parse({ ticket: TICKET })).toEqual({
      ticket: TICKET,
    });
    expect(confirmBodySchema.validate({})).toBe(false);
    expect(
      confirmBodySchema.validate({
        ticket: TICKET,
        route: "uploads",
        key: "a.png",
      }),
    ).toBe(false);
  });
});

describe("downloadQuerySchema", () => {
  it("requires route and key", () => {
    expect(downloadQuerySchema.validate({ key: "a.png" })).toBe(false);
    expect(
      downloadQuerySchema.parse({ route: "uploads", key: "a.png" }),
    ).toEqual({ route: "uploads", key: "a.png" });
  });

  it("takes name, not fileName", () => {
    expect(
      downloadQuerySchema.parse({
        route: "uploads",
        key: "a.png",
        name: " report.pdf ",
      }).name,
    ).toBe("report.pdf");
    expect(
      downloadQuerySchema.parse({ route: "uploads", key: "a.png", name: "" })
        .name,
    ).toBeUndefined();
    expect(
      downloadQuerySchema.validate({
        route: "uploads",
        key: "a.png",
        fileName: "report.pdf",
      }),
    ).toBe(false);
    expect(
      downloadQuerySchema.validate({
        route: "uploads",
        key: "a.png",
        name: NAME_256_BYTES,
      }),
    ).toBe(false);
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

  it("accepts expiresIn as a number or a query-string integer", () => {
    expect(
      downloadQuerySchema.parse({
        route: "uploads",
        key: "a.png",
        expiresIn: 60,
      }).expiresIn,
    ).toBe(60);
    expect(
      downloadQuerySchema.parse({
        route: "uploads",
        key: "a.png",
        expiresIn: "900",
      }).expiresIn,
    ).toBe(900);
    expect(
      downloadQuerySchema.parse({
        route: "uploads",
        key: "a.png",
        expiresIn: "",
      }).expiresIn,
    ).toBeUndefined();
  });

  it("rejects a non-positive or oversized expiresIn", () => {
    expect(
      downloadQuerySchema.validate({
        route: "uploads",
        key: "a.png",
        expiresIn: 0,
      }),
    ).toBe(false);
    expect(
      downloadQuerySchema.validate({
        route: "uploads",
        key: "a.png",
        expiresIn: 604_801,
      }),
    ).toBe(false);
  });
});

describe("fileQuerySchema", () => {
  it("requires route and key", () => {
    expect(fileQuerySchema.parse({ route: "uploads", key: "a.png" })).toEqual({
      route: "uploads",
      key: "a.png",
    });
  });

  it("takes name, not fileName, and no expiresIn", () => {
    expect(
      fileQuerySchema.parse({ route: "uploads", key: "a.png", name: "a.png" })
        .name,
    ).toBe("a.png");
    expect(
      fileQuerySchema.validate({
        route: "uploads",
        key: "a.png",
        fileName: "a.png",
      }),
    ).toBe(false);
    expect(
      fileQuerySchema.validate({
        route: "uploads",
        key: "a.png",
        expiresIn: 60,
      }),
    ).toBe(false);
  });
});

describe("routeCatalogResponseSchema", () => {
  const catalog = {
    routes: {
      uploads: {
        upload: {
          enabled: true,
          fileTypes: ["image/*"],
          multipart: true,
          checksum: false,
        },
        download: {
          enabled: true,
          maxExpiresIn: 600,
          disposition: "attachment",
          inlineTypes: ["image/png"],
          mode: "presign",
        },
        delete: { enabled: true },
      },
      avatars: {
        upload: { enabled: false },
        download: { enabled: false },
        delete: { enabled: false },
      },
    },
  };

  it("accepts a mixed catalog", () => {
    expect(routeCatalogResponseSchema.parse(catalog)).toEqual(catalog);
  });

  it("requires checksum on an enabled upload", () => {
    expect(
      routeCatalogResponseSchema.validate({
        routes: {
          uploads: {
            ...catalog.routes.uploads,
            upload: { enabled: true, multipart: false },
          },
        },
      }),
    ).toBe(false);
  });

  it("requires every download field and rejects the 1.x expiresIn", () => {
    expect(
      routeCatalogResponseSchema.validate({
        routes: {
          uploads: {
            ...catalog.routes.uploads,
            download: { enabled: true, expiresIn: 600 },
          },
        },
      }),
    ).toBe(false);
  });

  it("rejects upload.replace", () => {
    expect(
      routeCatalogResponseSchema.validate({
        routes: {
          uploads: {
            ...catalog.routes.uploads,
            upload: {
              ...catalog.routes.uploads.upload,
              replace: "overwrite",
            },
          },
        },
      }),
    ).toBe(false);
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

describe("deleteManyBodySchema", () => {
  it("requires 1 to DELETE_MANY_MAX_KEYS keys", () => {
    expect(
      deleteManyBodySchema.parse({
        route: "uploads",
        keys: ["uploads/a.png"],
      }),
    ).toEqual({ route: "uploads", keys: ["uploads/a.png"] });
    expect(deleteManyBodySchema.validate({ route: "uploads", keys: [] })).toBe(
      false,
    );
    const keys = Array.from(
      { length: DELETE_MANY_MAX_KEYS + 1 },
      (_, index) => `k${index}`,
    );
    expect(deleteManyBodySchema.validate({ route: "uploads", keys })).toBe(
      false,
    );
    expect(
      deleteManyBodySchema.validate({ route: "uploads", keys: keys.slice(1) }),
    ).toBe(true);
  });
});

describe("multipart schemas", () => {
  it("takes the upload fields on init, without checksum or partSize", () => {
    expect(multipartInitBodySchema.parse(uploadBody)).toEqual(uploadBody);
    expect(
      multipartInitBodySchema.validate({ ...uploadBody, partSize: 8 }),
    ).toBe(false);
    expect(
      multipartInitBodySchema.validate({ ...uploadBody, checksum: SHA256_HI }),
    ).toBe(false);
  });

  it("signs a part from the ticket and part number", () => {
    expect(
      multipartSignPartBodySchema.parse({ ticket: TICKET, partNumber: 1 }),
    ).toEqual({ ticket: TICKET, partNumber: 1 });
    expect(
      multipartSignPartBodySchema.parse({
        ticket: TICKET,
        partNumber: 2,
        checksum: SHA256_HI,
      }).checksum,
    ).toBe(SHA256_HI);
  });

  it("rejects an out-of-range part number and the 1.x session fields", () => {
    expect(
      multipartSignPartBodySchema.validate({ ticket: TICKET, partNumber: 0 }),
    ).toBe(false);
    expect(
      multipartSignPartBodySchema.validate({
        ticket: TICKET,
        partNumber: 10_001,
      }),
    ).toBe(false);
    expect(
      multipartSignPartBodySchema.validate({
        ticket: TICKET,
        partNumber: 1,
        partSize: 8,
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
  });

  it("takes only the ticket for list, complete, and abort", () => {
    expect(multipartTicketBodySchema.parse({ ticket: TICKET })).toEqual({
      ticket: TICKET,
    });
    expect(multipartTicketBodySchema.validate({})).toBe(false);
    expect(
      multipartTicketBodySchema.validate({
        ticket: TICKET,
        parts: [{ partNumber: 1 }],
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

  it("limits keys to 1024 UTF-8 bytes, not characters", () => {
    const key1024 = `${"€".repeat(341)}a`;
    expect(objectKeySchema.parse(key1024)).toBe(key1024);
    expect(objectKeySchema.validate(`${key1024}a`)).toBe(false);
    expect(objectKeySchema.validate("あ".repeat(700))).toBe(false);
    expect(objectKeySchema.validate("a".repeat(1025))).toBe(false);
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

describe("protocol types", () => {
  it("uses wire names and ticket-only payloads", () => {
    const upload: UploadPayload = uploadBodySchema.parse(uploadBody);
    const confirm: ConfirmPayload = confirmBodySchema.parse({ ticket: TICKET });
    expect(upload.name).toBe("a.png");
    expect(confirm.ticket).toBe(TICKET);

    expectTypeOf<UploadPayload>().not.toHaveProperty("fileName");
    expectTypeOf<ConfirmPayload>().toEqualTypeOf<{ ticket: string }>();
    expectTypeOf<MultipartTicketPayload>().toEqualTypeOf<{ ticket: string }>();
  });

  it("takes per-call options on every S3Api method", async () => {
    const seen: Array<S3RequestOptions | undefined> = [];
    const abort: S3Api["multipart"]["abort"] = async (payload, options) => {
      seen.push(options);
      return { key: "a.png", uploadId: payload.ticket };
    };
    const signal = AbortSignal.abort();

    await expect(abort({ ticket: TICKET }, { signal })).resolves.toEqual({
      key: "a.png",
      uploadId: TICKET,
    });
    expect(seen).toEqual([{ signal }]);

    expectTypeOf<Parameters<S3Api["upload"]>[1]>().toEqualTypeOf<
      S3RequestOptions | undefined
    >();
    expectTypeOf<Parameters<S3Api["catalog"]>[0]>().toEqualTypeOf<
      S3RequestOptions | undefined
    >();
    expectTypeOf<
      Parameters<S3Api<{ locals: object }>["deleteMany"]>[1]
    >().toEqualTypeOf<{ locals: object } | undefined>();
  });
});

describe("z.compile", () => {
  it("compiles every protocol schema", () => {
    const schemas = [
      trimmedString,
      optionalTrimmedString,
      fileNameSchema,
      contentTypeSchema,
      uploadTicketSchema,
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
      deleteManyBodySchema,
      multipartInitBodySchema,
      multipartSignPartBodySchema,
      multipartTicketBodySchema,
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
    expect(compiled.validate({ ...uploadBody, name: NAME_256_BYTES })).toBe(
      false,
    );
    expect(compiled.validate({})).toBe(false);
  });
});
