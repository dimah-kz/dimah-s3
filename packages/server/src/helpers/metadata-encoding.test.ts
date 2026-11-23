import { describe, expect, it } from "vitest";
import { decodeMetadataValue, encodeMetadataValue } from "./metadata-encoding";

describe("encodeMetadataValue", () => {
  it.each(["web", "user_123", "a b", "", "x=1; y=2", "~!@#$%^&*()"])(
    "keeps printable ASCII %j as is",
    (value) => {
      expect(encodeMetadataValue(value)).toBe(value);
    },
  );

  it("encodes non-ASCII as one RFC 2047 B word", () => {
    expect(encodeMetadataValue("é")).toBe("=?UTF-8?B?w6k=?=");
    expect(encodeMetadataValue("Привет, мир")).toBe(
      "=?UTF-8?B?0J/RgNC40LLQtdGCLCDQvNC40YA=?=",
    );
  });

  it.each([
    ["a leading space", " a"],
    ["a trailing space", "a "],
    ["a tab", "a\tb"],
    ["a newline", "a\nb"],
    ["a control character", "a\u0001"],
  ])("encodes a value with %s", (_, value) => {
    expect(encodeMetadataValue(value)).toMatch(/^=\?UTF-8\?B\?.*\?=$/);
  });

  it("encodes ASCII that reads as an encoded word", () => {
    const value = "=?UTF-8?B?w6k=?=";
    const encoded = encodeMetadataValue(value);

    expect(encoded).not.toBe(value);
    expect(decodeMetadataValue(encoded)).toBe(value);
  });

  it("only produces printable ASCII", () => {
    const encoded = encodeMetadataValue("日本語 🎉 \u0000 é");
    expect(encoded).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe("decodeMetadataValue", () => {
  it.each([
    "web",
    "",
    "é",
    " padded ",
    "日本語のファイル名.png",
    "emoji 🎉",
    "=?UTF-8?B?w6k=?=",
    "a".repeat(2000),
  ])("round-trips %j", (value) => {
    expect(decodeMetadataValue(encodeMetadataValue(value))).toBe(value);
  });

  it("decodes what S3 returns for non-ASCII metadata", () => {
    expect(decodeMetadataValue("=?UTF-8?B?w6k=?=")).toBe("é");
    expect(decodeMetadataValue("=?utf-8?b?w6k=?=")).toBe("é");
  });

  it("decodes Q encoding", () => {
    expect(decodeMetadataValue("=?UTF-8?Q?caf=C3=A9_au_lait?=")).toBe(
      "café au lait",
    );
  });

  it("joins adjacent encoded words, even when a character spans them", () => {
    // "é" is C3 A9; each word carries one byte.
    expect(decodeMetadataValue("=?UTF-8?Q?caf=C3?= =?UTF-8?Q?=A9?=")).toBe(
      "café",
    );
    expect(decodeMetadataValue("=?UTF-8?B?w6k=?=\r\n =?UTF-8?B?w6k=?=")).toBe(
      "éé",
    );
  });

  it("accepts a US-ASCII charset and an RFC 2231 language", () => {
    expect(decodeMetadataValue("=?US-ASCII?Q?hi?=")).toBe("hi");
    expect(decodeMetadataValue("=?UTF-8*en?Q?hi?=")).toBe("hi");
  });

  it.each([
    ["plain text", "hello world"],
    ["an unknown charset", "=?ISO-8859-1?Q?caf=E9?="],
    ["invalid base64", "=?UTF-8?B?w6k?=?="],
    ["base64 without padding", "=?UTF-8?B?w6k?="],
    ["a bad Q escape", "=?UTF-8?Q?caf=Z9?="],
    ["bytes that are not UTF-8", "=?UTF-8?B?/w==?="],
    ["an encoded word followed by text", "=?UTF-8?B?w6k=?= tail"],
    ["an unknown encoding", "=?UTF-8?X?abc?="],
  ])("returns %s unchanged", (_, value) => {
    expect(decodeMetadataValue(value)).toBe(value);
  });
});
