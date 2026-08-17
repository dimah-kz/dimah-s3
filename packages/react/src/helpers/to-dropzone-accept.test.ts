import { describe, expect, it } from "vitest";
import { toDropzoneAccept } from "./to-dropzone-accept";

describe("toDropzoneAccept", () => {
  it("returns undefined for empty input", () => {
    expect(toDropzoneAccept(undefined)).toBeUndefined();
    expect(toDropzoneAccept([])).toBeUndefined();
  });

  it("maps MIME wildcards and bare extensions", () => {
    expect(toDropzoneAccept(["image/*", ".pdf", "PDF"])).toEqual({
      "image/*": [],
      "*/*": [".pdf"],
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
      "*/*": [".png"],
    });
  });
});
