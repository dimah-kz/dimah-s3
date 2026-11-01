import { describe, expect, it } from "vitest";
import { APIError } from "../error";
import { matchesFileTypes, validateFile } from "./validate-file";

function file(name: string, type: string, contents = "x") {
  return new File([contents], name, { type });
}

describe("validateFile", () => {
  it("accepts a matching MIME wildcard", () => {
    expect(
      validateFile(file("a.png", "image/png"), {
        accept: ["image/*"],
        maxFileSize: 100,
      }),
    ).toBeNull();
  });

  it("accepts a matching extension regardless of MIME", () => {
    expect(
      validateFile(file("photo.PNG", "application/octet-stream"), {
        accept: [".png"],
      }),
    ).toBeNull();
  });

  it("accepts an exact MIME type", () => {
    expect(
      validateFile(file("a.json", "application/json"), {
        accept: ["application/json"],
      }),
    ).toBeNull();
  });

  it("accepts a named Blob", () => {
    const blob = Object.assign(new Blob(["x"], { type: "text/plain" }), {
      name: "notes.txt",
    });
    expect(validateFile(blob, { accept: ["text/*"] })).toBeNull();
  });

  it("rejects a disallowed type with the extension and allow-list", () => {
    const error = validateFile(file("a.exe", "application/octet-stream"), {
      accept: [".png", "image/*"],
    });
    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({
      code: "FILE_TYPE_NOT_ALLOWED",
      statusCode: 400,
      params: { type: ".exe", allowed: ".png, image/*" },
      message: 'File type ".exe" is not allowed',
    });
  });

  it("names the MIME type when the file has no extension", () => {
    const error = validateFile(file("README", "text/plain"), {
      accept: ["image/*"],
    });
    expect(error?.params).toMatchObject({ type: "text/plain" });
    const untyped = validateFile(file("README", ""), { accept: ["image/*"] });
    expect(untyped?.params).toMatchObject({ type: "unknown" });
  });

  it("rejects empty files after the type check", () => {
    const error = validateFile(file("a.txt", "text/plain", ""), {});
    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({
      code: "FILE_EMPTY",
      message: "File is empty",
    });
    expect(error?.params).toBeUndefined();
  });

  it("rejects oversized files with numeric byte params", () => {
    const error = validateFile(file("a.txt", "text/plain", "abcdef"), {
      maxFileSize: 2,
    });
    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({
      code: "FILE_TOO_LARGE",
      statusCode: 413,
      params: { size: 6, maxFileSize: 2 },
      message: "File is 6 bytes; the limit is 2 bytes",
    });
  });

  it("treats maxFileSize 0 as a hard cap", () => {
    expect(
      validateFile(file("a.txt", "text/plain"), { maxFileSize: 0 })?.code,
    ).toBe("FILE_TOO_LARGE");
  });

  it("skips type checks when accept is empty", () => {
    expect(
      validateFile(file("a.bin", "application/octet-stream"), { accept: [] }),
    ).toBeNull();
  });
});

describe("matchesFileTypes", () => {
  it("matches wildcards, extensions, and exact MIME types", () => {
    expect(matchesFileTypes("a.png", "image/png", ["image/*"])).toBe(true);
    expect(
      matchesFileTypes("photo.PNG", "application/octet-stream", [".png"]),
    ).toBe(true);
    expect(
      matchesFileTypes("a.json", "application/json", ["application/json"]),
    ).toBe(true);
    expect(
      matchesFileTypes("a.exe", "application/octet-stream", [".png"]),
    ).toBe(false);
    expect(matchesFileTypes("a.bin", "application/octet-stream", [])).toBe(
      true,
    );
  });
});

describe("matchesFileTypes normalization", () => {
  it("ignores case and parameters, like a browser accept list", () => {
    expect(matchesFileTypes("a.png", "image/PNG; x=1", ["image/png"])).toBe(
      true,
    );
    expect(matchesFileTypes("a.png", "image/png", ["Image/*"])).toBe(true);
    expect(matchesFileTypes("A.PDF", undefined, [".pdf"])).toBe(true);
    expect(matchesFileTypes("a.bin", "application/x-thing", ["*/*"])).toBe(
      true,
    );
    expect(matchesFileTypes("a.bin", "application/x-thing", ["image/*"])).toBe(
      false,
    );
  });
});
