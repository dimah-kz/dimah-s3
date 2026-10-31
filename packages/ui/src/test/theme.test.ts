// @vitest-environment node
/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The stylesheet without comments, so examples in them do not count. */
const css = readFileSync(
  new URL("../../css/shadcn.css", import.meta.url),
  "utf8",
).replaceAll(/\/\*[\s\S]*?\*\//g, "");

const tokens = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "primary",
  "primary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "border",
  "ring",
  "destructive",
  "success",
  "warning",
];

/** Custom property names declared in the first block after `selector`. */
function declared(selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf("}", start));
  return [...block.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]);
}

describe("css/shadcn.css", () => {
  it("gives every token a default on :root", () => {
    expect(declared(":root")).toEqual(tokens.map((t) => `--dimah-s3-${t}`));
  });

  it("maps a Tailwind color to every token through @theme inline", () => {
    expect(declared("@theme inline")).toEqual(
      tokens.map((t) => `--color-dimah-s3-${t}`),
    );
    for (const token of tokens) {
      expect(css).toContain(
        `--color-dimah-s3-${token}: var(--dimah-s3-${token});`,
      );
    }
  });

  it("points shadcn tokens at the matching shadcn variable", () => {
    for (const token of tokens.filter(
      (t) => t !== "success" && t !== "warning",
    )) {
      expect(css).toContain(`--dimah-s3-${token}: var(--${token});`);
    }
  });

  it("sets dark defaults for the tokens shadcn does not define", () => {
    expect(declared(".dark")).toEqual([
      "--dimah-s3-success",
      "--dimah-s3-warning",
    ]);
  });
});
