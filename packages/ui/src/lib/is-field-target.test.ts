import { describe, expect, it } from "vitest";
import { isFieldTarget } from "@/lib/is-field-target";

describe("isFieldTarget", () => {
  it.each(["input", "textarea", "select"])("is true for <%s>", (tag) => {
    expect(isFieldTarget(document.createElement(tag))).toBe(true);
  });

  it("is true for editable text", () => {
    const editor = document.createElement("div");
    // jsdom does not compute `isContentEditable` from the attribute.
    Object.defineProperty(editor, "isContentEditable", { value: true });

    expect(isFieldTarget(editor)).toBe(true);
  });

  it("is false for other elements and non-elements", () => {
    expect(isFieldTarget(document.createElement("button"))).toBe(false);
    expect(isFieldTarget(document.createElement("div"))).toBe(false);
    expect(isFieldTarget(document)).toBe(false);
    expect(isFieldTarget(null)).toBe(false);
  });
});
