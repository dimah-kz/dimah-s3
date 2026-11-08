import { isS3ErrorCode } from "@dimah-s3/core";
import { describe, expect, it } from "vitest";
import {
  folderAncestors,
  folderName,
  formatFolder,
  joinFolderPath,
  normalizeFolderPath,
  parentFolderPath,
  parseFolder,
} from "./folder-path";

describe("normalizeFolderPath", () => {
  it("accepts nested paths", () => {
    expect(normalizeFolderPath("docs")).toBe("docs");
    expect(normalizeFolderPath("docs/2026/q4")).toBe("docs/2026/q4");
    expect(normalizeFolderPath("my files/ünïcødé/文件")).toBe(
      "my files/ünïcødé/文件",
    );
  });

  it("accepts at most 32 levels", () => {
    const levels = (count: number) =>
      Array.from({ length: count }, (_, index) => `f${index}`).join("/");
    expect(normalizeFolderPath(levels(32))).toBe(levels(32));
    expect(normalizeFolderPath(levels(33))).toBeNull();
  });

  it("returns the NFC form", () => {
    const decomposed = "café/résumé";
    expect(normalizeFolderPath(decomposed)).toBe("café/résumé");
  });

  it.each([
    ["the root", ""],
    ["a leading slash", "/docs"],
    ["a trailing slash", "docs/"],
    ["an empty segment", "docs//q4"],
    ["a lone slash", "/"],
    ["a dot segment", "docs/./q4"],
    ["a dot-dot segment", "docs/../q4"],
    ["a NUL", "do\u0000cs"],
    ["a newline", "docs\nq4"],
    ["a C1 control", "docs\u0085"],
    ["a DEL", "docs\u007f"],
    ["a lone surrogate", "docs/\ud800"],
  ])("rejects %s", (_, path) => {
    expect(normalizeFolderPath(path)).toBeNull();
  });

  it("allows dots inside a name", () => {
    expect(normalizeFolderPath(".git/..config/a.b")).toBe(".git/..config/a.b");
  });

  it("caps a segment at 255 characters", () => {
    expect(normalizeFolderPath("a".repeat(255))).toBe("a".repeat(255));
    expect(normalizeFolderPath("a".repeat(256))).toBeNull();
  });

  it("counts a character outside the BMP once", () => {
    const emoji = "\u{1f4c1}".repeat(255);
    expect(emoji).toHaveLength(510);
    expect(normalizeFolderPath(emoji)).toBe(emoji);
    expect(normalizeFolderPath(`${emoji}\u{1f4c1}`)).toBeNull();
  });

  it("caps the path at 1024 UTF-8 bytes", () => {
    const path = Array.from({ length: 5 }, () => "a".repeat(204)).join("/");
    expect(path).toHaveLength(1024);
    expect(normalizeFolderPath(path)).toBe(path);
    expect(normalizeFolderPath(`${path}a`)).toBeNull();
  });

  it("counts a two-byte script by its bytes", () => {
    // `س` is 2 bytes: 5 × 102 letters and 4 slashes are 1024 bytes.
    const path = Array.from({ length: 5 }, () => "س".repeat(102)).join("/");
    expect(path).toHaveLength(514);
    expect(normalizeFolderPath(path)).toBe(path);
    expect(normalizeFolderPath(`${path}س`)).toBeNull();
  });
});

describe("parseFolder", () => {
  it("reads the wire root as null", () => {
    expect(parseFolder("")).toBeNull();
  });

  it("returns the normalized path", () => {
    expect(parseFolder("café")).toBe("café");
  });

  it("throws FOLDER_INVALID", () => {
    let error: unknown;
    try {
      parseFolder("/docs");
    } catch (thrown) {
      error = thrown;
    }
    expect(isS3ErrorCode(error, "FOLDER_INVALID")).toBe(true);
    expect(error).toMatchObject({ statusCode: 400 });
  });
});

describe("path helpers", () => {
  it("formats the root as an empty string", () => {
    expect(formatFolder(null)).toBe("");
    expect(formatFolder("docs/q4")).toBe("docs/q4");
  });

  it("joins a name to a parent", () => {
    expect(joinFolderPath(null, "docs")).toBe("docs");
    expect(joinFolderPath("docs", "q4")).toBe("docs/q4");
  });

  it("splits a path into parent and name", () => {
    expect(parentFolderPath("docs")).toBeNull();
    expect(parentFolderPath("docs/2026/q4")).toBe("docs/2026");
    expect(folderName("docs")).toBe("docs");
    expect(folderName("docs/2026/q4")).toBe("q4");
  });

  it("lists the ancestors down to the path", () => {
    expect(folderAncestors("docs")).toEqual(["docs"]);
    expect(folderAncestors("docs/2026/q4")).toEqual([
      "docs",
      "docs/2026",
      "docs/2026/q4",
    ]);
  });
});
