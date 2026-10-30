import { describe, expect, it } from "vitest";
import { resolveInlineDisposition } from "./resolve-inline-disposition";

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
});
