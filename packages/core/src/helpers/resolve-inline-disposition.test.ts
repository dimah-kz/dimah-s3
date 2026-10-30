import { describe, expect, it } from "vitest";
import {
  DEFAULT_INLINE_TYPES,
  resolveInlineDisposition,
} from "./resolve-inline-disposition";

const allow = ["image/*", "application/pdf", "text/plain"];

describe("resolveInlineDisposition", () => {
  it("keeps inline for an allowed type", () => {
    expect(
      resolveInlineDisposition({
        contentType: "image/png",
        allow,
        requested: "inline",
      }),
    ).toEqual({ disposition: "inline" });
    expect(
      resolveInlineDisposition({
        contentType: "text/plain; charset=utf-8",
        allow,
        requested: "inline",
      }),
    ).toEqual({ disposition: "inline" });
  });

  it("signs attachment for a type that is not allowed", () => {
    expect(
      resolveInlineDisposition({
        contentType: "application/zip",
        allow,
        requested: "inline",
      }),
    ).toEqual({ disposition: "attachment" });
  });

  it("keeps attachment when the client did not ask for inline", () => {
    expect(
      resolveInlineDisposition({
        contentType: "image/png",
        allow,
        requested: "attachment",
      }),
    ).toEqual({ disposition: "attachment" });
  });

  it("does not let a wildcard enable active content", () => {
    for (const contentType of [
      "image/svg+xml",
      "text/html",
      "application/xhtml+xml",
      "text/xml",
      "text/javascript",
    ]) {
      expect(
        resolveInlineDisposition({
          contentType,
          allow: ["image/*", "text/*", "application/*"],
          requested: "inline",
        }),
      ).toEqual({ disposition: "attachment" });
    }
    expect(
      resolveInlineDisposition({
        contentType: "image/svg+xml",
        allow: ["image/svg+xml"],
        requested: "inline",
      }),
    ).toEqual({ disposition: "inline" });
  });

  it("types an untyped object from its file name", () => {
    expect(
      resolveInlineDisposition({
        contentType: "application/octet-stream",
        fileName: "plan.PDF",
        allow,
        requested: "inline",
      }),
    ).toEqual({ disposition: "inline", contentType: "application/pdf" });
    expect(
      resolveInlineDisposition({
        fileName: "page.html",
        allow,
        requested: "inline",
      }),
    ).toEqual({ disposition: "attachment" });
  });

  it("does not trust the file name over a stored type", () => {
    expect(
      resolveInlineDisposition({
        contentType: "text/html",
        fileName: "plan.pdf",
        allow,
        requested: "inline",
      }),
    ).toEqual({ disposition: "attachment" });
  });

  it("ignores extension tokens", () => {
    expect(
      resolveInlineDisposition({
        contentType: "application/pdf",
        fileName: "plan.pdf",
        allow: [".pdf"],
        requested: "inline",
      }),
    ).toEqual({ disposition: "attachment" });
  });

  describe("without an allow list", () => {
    it.each([
      ["image/png", undefined],
      ["application/pdf", undefined],
      ["video/mp4", undefined],
      ["text/plain; charset=utf-8", undefined],
      [undefined, "photo.avif"],
    ])("opens %s %s inline", (contentType, fileName) => {
      expect(
        resolveInlineDisposition({ contentType, fileName, requested: "inline" })
          .disposition,
      ).toBe("inline");
    });

    it.each([
      ["text/html", undefined],
      ["image/svg+xml", undefined],
      ["application/xhtml+xml", undefined],
      [undefined, "x.svg"],
      ["application/octet-stream", "x.html"],
      ["application/zip", undefined],
    ])("signs %s %s as attachment", (contentType, fileName) => {
      expect(
        resolveInlineDisposition({
          contentType,
          fileName,
          requested: "inline",
        }),
      ).toEqual({ disposition: "attachment" });
    });

    it("lists raster images, PDF, audio, video, and plain text", () => {
      expect(DEFAULT_INLINE_TYPES).toEqual([
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/avif",
        "image/bmp",
        "application/pdf",
        "audio/*",
        "video/*",
        "text/plain",
      ]);
    });
  });

  it("never inlines with allow: false", () => {
    for (const contentType of ["image/png", "application/pdf", "text/plain"]) {
      expect(
        resolveInlineDisposition({
          contentType,
          allow: false,
          requested: "inline",
        }),
      ).toEqual({ disposition: "attachment" });
    }
  });
});
