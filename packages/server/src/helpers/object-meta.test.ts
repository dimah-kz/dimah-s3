import { describe, expect, it } from "vitest";
import { ConfigError } from "@/helpers/error-boundary";
import {
  buildObjectMetadata,
  MAX_METADATA_BYTES,
  readObjectMetadata,
} from "./object-meta";

const token = "AAAAAAAAAAAAAAAAAAAAAA";

describe("buildObjectMetadata", () => {
  it("adds the marker and the previous key to the user metadata", () => {
    expect(
      buildObjectMetadata({
        metadata: { source: "web" },
        uploadToken: token,
        previousKey: "uploads/old.png",
      }),
    ).toEqual({
      source: "web",
      "dimah-upload": token,
      "dimah-previous-key": "uploads/old.png",
    });
  });

  it("lowercases keys and RFC 2047-encodes non-ASCII values", () => {
    expect(
      buildObjectMetadata({
        metadata: { Author: "José" },
        uploadToken: token,
        previousKey: "uploads/café.png",
      }),
    ).toEqual({
      author: "=?UTF-8?B?Sm9zw6k=?=",
      "dimah-upload": token,
      "dimah-previous-key": "=?UTF-8?B?dXBsb2Fkcy9jYWbDqS5wbmc=?=",
    });
  });

  it.each([
    ["an internal key", { "Dimah-Upload": "x" }, /is reserved/],
    ["a key that is not a header name", { "a b": "x" }, /not a valid name/],
    ["a key set twice", { a: "1", A: "2" }, /is set twice/],
  ])("rejects %s", (_, metadata, message) => {
    expect(() => buildObjectMetadata({ metadata, uploadToken: token })).toThrow(
      expect.objectContaining({
        name: "ConfigError",
        message: expect.stringMatching(message),
      }),
    );
  });

  it("allows exactly 2048 bytes including the marker", () => {
    const marker = "dimah-upload".length + token.length;
    const value = "v".repeat(MAX_METADATA_BYTES - marker - 1);

    expect(() =>
      buildObjectMetadata({ metadata: { k: value }, uploadToken: token }),
    ).not.toThrow();
    expect(() =>
      buildObjectMetadata({ metadata: { k: `${value}v` }, uploadToken: token }),
    ).toThrow(ConfigError);
  });

  it("counts encoded values and internal keys toward the limit", () => {
    // 600 two-byte characters: 1200 bytes raw, about 1600 once encoded.
    const metadata = { name: "é".repeat(600) };
    expect(() =>
      buildObjectMetadata({ metadata, uploadToken: token }),
    ).not.toThrow();
    expect(() =>
      buildObjectMetadata({
        metadata,
        uploadToken: token,
        previousKey: `uploads/${"k".repeat(400)}`,
      }),
    ).toThrow(/S3 allows 2048/);
  });
});

describe("readObjectMetadata", () => {
  it("splits internal keys from decoded user metadata", () => {
    expect(
      readObjectMetadata({
        Author: "=?UTF-8?B?Sm9zw6k=?=",
        source: "web",
        "dimah-upload": token,
        "dimah-previous-key": "=?UTF-8?B?dXBsb2Fkcy9jYWbDqS5wbmc=?=",
      }),
    ).toEqual({
      metadata: { author: "José", source: "web" },
      uploadToken: token,
      previousKey: "uploads/café.png",
    });
  });

  it("round-trips what buildObjectMetadata writes", () => {
    const metadata = { title: "日本語", plain: "ok", spaced: " x " };
    const written = buildObjectMetadata({
      metadata,
      uploadToken: token,
      previousKey: "uploads/a.png",
    });

    expect(readObjectMetadata(written)).toEqual({
      metadata,
      uploadToken: token,
      previousKey: "uploads/a.png",
    });
  });

  it("handles missing metadata", () => {
    expect(readObjectMetadata(undefined)).toEqual({
      metadata: {},
      uploadToken: undefined,
      previousKey: undefined,
    });
  });
});
