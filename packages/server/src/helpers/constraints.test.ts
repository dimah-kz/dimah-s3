import { validateFile } from "@dimah-s3/core";
import { describe, expect, it } from "vitest";
import { assertFileConstraints, assertWithinMaxFileSize } from "./constraints";

describe("assertWithinMaxFileSize", () => {
  it("allows an unset max and sizes at the cap", () => {
    expect(() => assertWithinMaxFileSize(undefined, 999)).not.toThrow();
    expect(() => assertWithinMaxFileSize(10, 10)).not.toThrow();
    expect(() => assertWithinMaxFileSize(10, 0)).not.toThrow();
  });

  it("fails with FILE_TOO_LARGE over the cap", () => {
    expect(() => assertWithinMaxFileSize(10, 11)).toThrow(
      expect.objectContaining({
        code: "FILE_TOO_LARGE",
        statusCode: 413,
        params: { size: 11, maxFileSize: 10 },
      }),
    );
  });
});

describe("assertFileConstraints", () => {
  const images = { fileTypes: ["image/*", ".pdf"], maxFileSize: 100 };

  it("allows a file that matches a type and the size cap", () => {
    expect(() =>
      assertFileConstraints(images, {
        name: "a.png",
        size: 100,
        type: "image/png",
      }),
    ).not.toThrow();
    expect(() =>
      assertFileConstraints(images, { name: "doc.pdf", size: 1 }),
    ).not.toThrow();
  });

  it("allows anything without constraints", () => {
    expect(() =>
      assertFileConstraints({}, { name: "a.exe", size: 1e9 }),
    ).not.toThrow();
  });

  it("rejects a declared size over maxFileSize", () => {
    expect(() =>
      assertFileConstraints(images, {
        name: "a.png",
        size: 101,
        type: "image/png",
      }),
    ).toThrow(expect.objectContaining({ code: "FILE_TOO_LARGE" }));
  });

  it("rejects an empty file with FILE_EMPTY, after the type check", () => {
    expect(() => assertFileConstraints({}, { name: "a.png", size: 0 })).toThrow(
      expect.objectContaining({ code: "FILE_EMPTY", statusCode: 400 }),
    );
    expect(() =>
      assertFileConstraints(images, { name: "a.exe", size: 0 }),
    ).toThrow(expect.objectContaining({ code: "FILE_TYPE_NOT_ALLOWED" }));
  });

  it("names the extension and the allow-list when the type is not allowed", () => {
    expect(() =>
      assertFileConstraints(images, {
        name: "a.exe",
        size: 1,
        type: "application/x-msdownload",
      }),
    ).toThrow(
      expect.objectContaining({
        code: "FILE_TYPE_NOT_ALLOWED",
        statusCode: 400,
        params: { type: ".exe", allowed: "image/*, .pdf" },
      }),
    );
  });

  it("falls back to the MIME type, then to unknown", () => {
    const reject = (file: { name?: string; size: number; type?: string }) => {
      try {
        assertFileConstraints(images, file);
      } catch (error) {
        return (error as { params?: { type?: string } }).params?.type;
      }
      return undefined;
    };

    expect(reject({ name: "README", size: 1, type: "text/plain" })).toBe(
      "text/plain",
    );
    expect(reject({ size: 1 })).toBe("unknown");
  });

  it.each([
    ["a.exe", "application/x-msdownload"],
    ["README", "text/plain"],
    ["README", ""],
    ["archive.", "application/zip"],
    [".env", ""],
  ])(
    "names the type of %s (%s) exactly like the browser check",
    (name, type) => {
      const fileTypes = ["image/*"];
      const browser = validateFile(
        Object.assign(new Blob(["x"], { type }), { name }),
        { accept: fileTypes },
      );
      expect(browser?.code).toBe("FILE_TYPE_NOT_ALLOWED");
      expect(() =>
        assertFileConstraints(
          { fileTypes },
          { name, size: 1, type: type || undefined },
        ),
      ).toThrow(expect.objectContaining({ params: browser?.params }));
    },
  );

  it("checks HeadObject values at confirm, where the name may be missing", () => {
    expect(() =>
      assertFileConstraints(images, { size: 100, type: "image/png" }),
    ).not.toThrow();
    expect(() =>
      assertFileConstraints(images, { size: 20, type: "text/html" }),
    ).toThrow(expect.objectContaining({ code: "FILE_TYPE_NOT_ALLOWED" }));
  });
});
