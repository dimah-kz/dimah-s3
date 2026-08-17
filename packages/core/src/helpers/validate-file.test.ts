import { describe, expect, it } from "vitest";
import { validateFile } from "./validate-file";

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

  it("rejects a disallowed type with the extension in params", () => {
    const err = validateFile(file("a.exe", "application/octet-stream"), {
      accept: [".png", "image/*"],
    });
    expect(err).toMatchObject({
      code: "FILE_TYPE_NOT_ALLOWED",
      params: { type: ".exe" },
    });
  });

  it("rejects empty files after the type check", () => {
    expect(validateFile(file("a.txt", "text/plain", ""), {})?.code).toBe(
      "FILE_EMPTY",
    );
  });

  it("rejects oversized files", () => {
    const err = validateFile(file("a.txt", "text/plain", "abcdef"), {
      maxFileSize: 2,
    });
    expect(err?.code).toBe("FILE_TOO_LARGE");
    expect(err?.params).toHaveProperty("size");
  });

  it("skips type checks when accept is empty", () => {
    expect(
      validateFile(file("a.bin", "application/octet-stream"), {}),
    ).toBeNull();
  });
});
