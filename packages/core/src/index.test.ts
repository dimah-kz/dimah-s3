import { describe, expect, it } from "vitest";
import {
  DimahS3Error,
  buildContentDisposition,
  formatFileSize,
  normalizeS3ApiBasePath,
  parseFileName,
  pluginPath,
  sanitizeFileName,
  truncateFileName,
  validateFile,
} from "./index";

describe("normalizeS3ApiBasePath", () => {
  it("strips trailing slash", () => {
    expect(normalizeS3ApiBasePath("/api/s3/")).toBe("/api/s3");
  });
});

describe("pluginPath", () => {
  it("builds plugin paths", () => {
    expect(pluginPath("db", "objects")).toBe("/db/objects");
    expect(pluginPath("db", "/objects")).toBe("/db/objects");
  });
});

describe("validateFile", () => {
  it("rejects disallowed types", () => {
    const file = new File(["x"], "a.exe", { type: "application/octet-stream" });
    const err = validateFile(file, { accept: [".png", "image/*"] });
    expect(err?.code).toBe("FILE_TYPE_NOT_ALLOWED");
  });

  it("rejects empty files", () => {
    const file = new File([], "a.txt", { type: "text/plain" });
    expect(validateFile(file, {})?.code).toBe("FILE_EMPTY");
  });

  it("rejects oversized files", () => {
    const file = new File(["abcdef"], "a.txt", { type: "text/plain" });
    expect(validateFile(file, { maxFileSize: 2 })?.code).toBe("FILE_TOO_LARGE");
  });

  it("accepts valid files", () => {
    const file = new File(["hi"], "a.png", { type: "image/png" });
    expect(
      validateFile(file, { accept: ["image/*"], maxFileSize: 100 }),
    ).toBeNull();
  });
});

describe("helpers", () => {
  it("sanitizeFileName", () => {
    expect(sanitizeFileName('a"b\\c\nd')).toBe("a_b_c_d");
  });

  it("buildContentDisposition / parseFileName", () => {
    const header = buildContentDisposition("фото.png");
    expect(header).toContain("filename=");
    expect(parseFileName(header)).toBe("фото.png");
  });

  it("formatFileSize / truncateFileName", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(truncateFileName("short.txt")).toBe("short.txt");
    expect(
      truncateFileName("a".repeat(80) + ".png").length,
    ).toBeLessThanOrEqual(50);
  });
});

describe("DimahS3Error", () => {
  it("stores status and optional cause", () => {
    const cause = new Error("root");
    const err = new DimahS3Error("boom", 418, { cause });
    expect(err.status).toBe(418);
    expect(err.cause).toBe(cause);
  });

  it("stores code and params", () => {
    const err = new DimahS3Error("name is required", 400, {
      code: "FIELD_REQUIRED",
      params: { name: "key" },
    });
    expect(err.code).toBe("FIELD_REQUIRED");
    expect(err.params).toEqual({ name: "key" });
  });
});
