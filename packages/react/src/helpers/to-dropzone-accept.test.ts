import { useDropzone } from "react-dropzone";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/render-hook";
import { toDropzoneAccept, toHtmlAcceptAttr } from "./to-dropzone-accept";

const EXT_CARRIER = "application/x-dimah-accept";

describe("toDropzoneAccept", () => {
  it("returns undefined for empty input", () => {
    expect(toDropzoneAccept(undefined)).toBeUndefined();
    expect(toDropzoneAccept([])).toBeUndefined();
  });

  it("maps MIME tokens to keys and extensions to the carrier", () => {
    expect(toDropzoneAccept(["image/*", ".pdf"])).toEqual({
      "image/*": [],
      [EXT_CARRIER]: [".pdf"],
    });
  });

  it("keeps concrete MIME types", () => {
    expect(toDropzoneAccept(["application/json", "text/plain"])).toEqual({
      "application/json": [],
      "text/plain": [],
    });
  });

  it("skips blank entries", () => {
    expect(toDropzoneAccept(["  ", ".png"])).toEqual({
      [EXT_CARRIER]: [".png"],
    });
  });

  it("omits tokens that are not HTML accept specifiers", () => {
    expect(toDropzoneAccept(["*/*"])).toBeUndefined();
    expect(toDropzoneAccept(["*/*", "image/*"])).toEqual({
      "image/*": [],
    });
    expect(
      toDropzoneAccept(["*/json", "foo/*", "application/*"]),
    ).toBeUndefined();
    expect(toDropzoneAccept(["pdf"])).toBeUndefined();
  });

  it("maps the homepage demo accept list", () => {
    expect(toDropzoneAccept(["image/*", "application/pdf", "video/*"])).toEqual({
      "image/*": [],
      "application/pdf": [],
      "video/*": [],
    });
  });

  it("dedupes extensions without guessing IANA types", () => {
    expect(toDropzoneAccept([".jpg", ".jpeg", ".jpg", ".foo"])).toEqual({
      [EXT_CARRIER]: [".jpg", ".jpeg", ".foo"],
    });
  });

  it("does not warn when react-dropzone receives the mapped accept", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hook = renderHook(() =>
      useDropzone({
        accept: toDropzoneAccept(["image/*", ".pdf", "video/*"]),
      }),
    );
    expect(warn).not.toHaveBeenCalled();
    hook.unmount();
  });
});

describe("toHtmlAcceptAttr", () => {
  it("joins trimmed tokens for the native input", () => {
    expect(toHtmlAcceptAttr(undefined)).toBeUndefined();
    expect(toHtmlAcceptAttr([])).toBeUndefined();
    expect(toHtmlAcceptAttr(["image/*", ".pdf"])).toBe("image/*,.pdf");
    expect(toHtmlAcceptAttr(["  ", "video/*"])).toBe("video/*");
  });
});
