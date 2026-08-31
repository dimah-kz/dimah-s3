import { describe, expect, it } from "vitest";
import { pluginPath } from "./plugin-path";

describe("pluginPath", () => {
  it.each([
    ["db", "objects", "/db/objects"],
    ["db", "/objects", "/db/objects"],
    ["audit", "//recent", "/audit/recent"],
  ])("joins %s + %s", (id, path, expected) => {
    expect(pluginPath(id, path)).toBe(expected);
  });

  it("rejects an unsafe plugin id", () => {
    expect(() => pluginPath("..", "objects")).toThrow(/Invalid plugin id/);
    expect(() => pluginPath("has space", "objects")).toThrow(
      /Invalid plugin id/,
    );
  });
});
