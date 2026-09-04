import { describe, expect, it } from "vitest";
import {
  encodeObjectTagging,
  normalizeObjectS3,
  objectCommandExtras,
  objectPutHeaders,
} from "./object-s3";
import { S3_ERROR_CODES } from "@dimah-s3/core";

function expectValidation(run: () => void) {
  try {
    run();
    expect.unreachable();
  } catch (error) {
    expect(error).toMatchObject({
      code: S3_ERROR_CODES.VALIDATION_ERROR.code,
    });
  }
}

describe("encodeObjectTagging", () => {
  it("encodes a single tag", () => {
    expect(encodeObjectTagging({ owner: "ada" })).toBe("owner=ada");
  });

  it("percent-encodes reserved characters", () => {
    expect(encodeObjectTagging({ "a b": "c&d" })).toBe("a%20b=c%26d");
  });

  it("rejects more than 10 tags", () => {
    const tagging = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [`k${i}`, "v"]),
    );
    expectValidation(() => encodeObjectTagging(tagging));
  });

  it("rejects an empty tag key", () => {
    expectValidation(() => encodeObjectTagging({ "": "v" }));
  });
});

describe("normalizeObjectS3", () => {
  it("omits blank storage class, cache control, and empty tagging", () => {
    expect(
      normalizeObjectS3({
        storageClass: "  ",
        cacheControl: "",
        tagging: {},
      }),
    ).toEqual({});
  });

  it("trims storage class and cache control", () => {
    expect(
      normalizeObjectS3({
        storageClass: " STANDARD_IA ",
        cacheControl: " max-age=60 ",
      }),
    ).toEqual({
      storageClass: "STANDARD_IA",
      cacheControl: "max-age=60",
    });
  });

  it("rejects invalid tagging", () => {
    expectValidation(() =>
      normalizeObjectS3({
        tagging: Object.fromEntries(
          Array.from({ length: 11 }, (_, i) => [`k${i}`, "v"]),
        ),
      }),
    );
  });
});

describe("object S3 extras", () => {
  it("omits empty options", () => {
    expect(objectCommandExtras({})).toEqual({});
    expect(objectPutHeaders({})).toEqual({});
  });

  it("maps storage class, cache control, and tagging", () => {
    const opts = {
      storageClass: "STANDARD_IA",
      cacheControl: "max-age=3600",
      tagging: { env: "prod" },
    };
    expect(objectCommandExtras(opts)).toEqual({
      StorageClass: "STANDARD_IA",
      CacheControl: "max-age=3600",
      Tagging: "env=prod",
    });
    expect(objectPutHeaders(opts)).toEqual({
      "x-amz-storage-class": "STANDARD_IA",
      "Cache-Control": "max-age=3600",
      "x-amz-tagging": "env=prod",
    });
  });
});
