// @vitest-environment node
/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The stylesheet without comments, so examples in them do not count. */
const css = readFileSync(
  new URL("../../css/shadcn.css", import.meta.url),
  "utf8",
).replaceAll(/\/\*[\s\S]*?\*\//g, "");

const shadcnTokens = [
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
];

const fallbackTokens = ["success", "warning"];

const tokens = [...shadcnTokens, ...fallbackTokens];

/** Custom properties of the first block after `selector`, values on one line. */
function declarations(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/(--[a-z0-9-]+)\s*:([^;]+);/g)].map(
      ([, name, value]) => [
        name,
        value
          .replaceAll(/\s+/g, " ")
          .replaceAll(/\(\s/g, "(")
          .replaceAll(/\s\)/g, ")")
          .trim(),
      ],
    ),
  );
}

describe("css/shadcn.css", () => {
  it("maps a Tailwind color to every token through @theme inline", () => {
    expect(Object.keys(declarations("@theme inline"))).toEqual(
      tokens.map((t) => `--color-dimah-s3-${t}`),
    );
  });

  it("resolves the shadcn fallback where the utility is used", () => {
    const theme = declarations("@theme inline");
    for (const token of shadcnTokens) {
      expect(theme[`--color-dimah-s3-${token}`]).toBe(
        `var(--dimah-s3-${token}, var(--${token}))`,
      );
    }
    for (const token of fallbackTokens) {
      expect(theme[`--color-dimah-s3-${token}`]).toBe(
        `var(--dimah-s3-${token}, var(--${token}, var(--dimah-s3-${token}-default)))`,
      );
    }
  });

  // A custom property holding `var()` is computed where it is declared, so a
  // token on :root would freeze the root theme for nested `.dark` containers.
  it("declares only plain default colors on :root and .dark", () => {
    for (const selector of [":root", ".dark"]) {
      const block = declarations(selector);
      expect(Object.keys(block)).toEqual(
        fallbackTokens.map((t) => `--dimah-s3-${t}-default`),
      );
      for (const value of Object.values(block)) {
        expect(value).toMatch(/^oklch\([^()]+\)$/);
      }
    }
    expect(declarations(":root")).not.toEqual(declarations(".dark"));
  });
});
