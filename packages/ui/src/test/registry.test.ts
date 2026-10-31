// @vitest-environment node
/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type CssVars = Partial<
  Record<"light" | "dark" | "theme", Record<string, string>>
>;

type RegistryJson = {
  items: { name: string; cssVars?: CssVars }[];
};

/** The stylesheet without comments, so examples in them do not count. */
const css = readFileSync(
  new URL("../../css/shadcn.css", import.meta.url),
  "utf8",
).replaceAll(/\/\*[\s\S]*?\*\//g, "");

const registry = JSON.parse(
  readFileSync(new URL("../../registry.json", import.meta.url), "utf8"),
) as RegistryJson;

/** Custom properties of the first block after `selector`, without `--`. */
function declarations(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/--([a-z0-9-]+)\s*:([^;]+);/g)].map(
      ([, name, value]) => [name, value.trim()],
    ),
  );
}

describe("registry.json cssVars", () => {
  it("emits the same tokens and defaults as css/shadcn.css", () => {
    const expected: CssVars = {
      light: declarations(":root"),
      dark: declarations(".dark"),
      theme: declarations("@theme inline"),
    };

    expect(registry.items.length).toBeGreaterThan(0);
    for (const item of registry.items) {
      expect({ item: item.name, cssVars: item.cssVars }).toEqual({
        item: item.name,
        cssVars: expected,
      });
    }
  });
});
