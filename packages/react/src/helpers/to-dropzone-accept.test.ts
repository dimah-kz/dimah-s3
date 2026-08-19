import { useDropzone } from "react-dropzone";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/render-hook";
import { toDropzoneAccept } from "./to-dropzone-accept";

describe("toDropzoneAccept", () => {
  it("returns undefined for empty input", () => {
    expect(toDropzoneAccept(undefined)).toBeUndefined();
    expect(toDropzoneAccept([])).toBeUndefined();
  });

  it("maps MIME wildcards and bare extensions to real MIME keys", () => {
    expect(toDropzoneAccept(["image/*", ".pdf", "PDF"])).toEqual({
      "image/*": [],
      "application/pdf": [".pdf"],
    });
  });

  it("keeps explicit MIME types", () => {
    expect(toDropzoneAccept(["application/json", "text/plain"])).toEqual({
      "application/json": [],
      "text/plain": [],
    });
  });

  it("skips blank entries", () => {
    expect(toDropzoneAccept(["  ", ".png"])).toEqual({
      "image/png": [".png"],
    });
  });

  it("omits */* so dropzone never receives an invalid MIME key", () => {
    expect(toDropzoneAccept(["*/*"])).toBeUndefined();
    expect(toDropzoneAccept(["*/*", "image/*"])).toEqual({
      "image/*": [],
    });
    expect(toDropzoneAccept(["*/json", "foo/*"])).toBeUndefined();
  });

  it("maps the homepage demo accept list without */*", () => {
    expect(toDropzoneAccept(["image/*", ".pdf", "video/*"])).toEqual({
      "image/*": [],
      "application/pdf": [".pdf"],
      "video/*": [],
    });
  });

  it("groups jpeg aliases and falls back for unknown extensions", () => {
    expect(toDropzoneAccept([".jpg", ".jpeg", ".foo"])).toEqual({
      "image/jpeg": [".jpg", ".jpeg"],
      "application/x-foo": [".foo"],
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
