import { describe, expect, it } from "vitest";
import {
  baseType,
  describeFileType,
  effectiveContentType,
} from "./content-type";

describe("baseType", () => {
  it("drops parameters and lower-cases the type", () => {
    expect(baseType("Text/Plain; charset=utf-8")).toBe("text/plain");
    expect(baseType(" image/png ")).toBe("image/png");
  });

  it("returns an empty string for a missing type", () => {
    expect(baseType(undefined)).toBe("");
    expect(baseType("")).toBe("");
  });
});

describe("effectiveContentType", () => {
  it("returns the stored base type when one is set", () => {
    expect(effectiveContentType("IMAGE/JPEG; q=1")).toBe("image/jpeg");
    expect(effectiveContentType("text/plain", "x.png")).toBe("text/plain");
  });

  it.each([undefined, "", "application/octet-stream", "binary/octet-stream"])(
    "infers the type from the name when the stored type is %j",
    (type) => {
      expect(effectiveContentType(type, "photo.PNG")).toBe("image/png");
      expect(effectiveContentType(type, "a.b.svg")).toBe("image/svg+xml");
    },
  );

  it("treats a generic type with parameters as untyped", () => {
    expect(
      effectiveContentType("Application/Octet-Stream; x=1", "song.mp3"),
    ).toBe("audio/mpeg");
  });

  it("returns undefined when neither the type nor the name gives one", () => {
    expect(effectiveContentType()).toBeUndefined();
    expect(effectiveContentType("application/octet-stream")).toBeUndefined();
    expect(effectiveContentType(undefined, "README")).toBeUndefined();
    expect(effectiveContentType(undefined, "notes.bin")).toBeUndefined();
  });
});

describe("describeFileType", () => {
  it.each([
    ["a.exe", "application/x-msdownload", ".exe"],
    ["archive.tar.gz", undefined, ".gz"],
    [".env", "", ".env"],
    ["README", "text/plain", "text/plain"],
    ["archive.", "application/zip", "application/zip"],
    ["README", undefined, "unknown"],
    ["", "", "unknown"],
  ])("labels %j (%j) as %j", (name, type, label) => {
    expect(describeFileType(name, type)).toBe(label);
  });
});
