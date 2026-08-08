import { describe, expect, it } from "vitest";

import {
  findTemplate,
  loadCatalog,
  normalizeTemplateId,
  resolveTemplate,
} from "../templates/registry.js";
import { CliError } from "../utils/errors.js";

const templates = [
  { id: "nextjs", title: "Next.js" },
  { id: "remix", title: "Remix" },
];

describe("findTemplate", () => {
  it("returns the matching entry", () => {
    expect(findTemplate(templates, "remix").title).toBe("Remix");
  });

  it("lists the available ids when unknown", () => {
    expect(() => findTemplate(templates, "svelte")).toThrow(
      /Available: nextjs, remix/,
    );
  });
});

describe("normalizeTemplateId", () => {
  it("trims and lowercases", () => {
    expect(normalizeTemplateId("  NextJS ")).toBe("nextjs");
  });
});

// Reads the snapshot produced by `pnpm build` (turbo runs build before test).
describe("catalog on disk", () => {
  it("lists at least one template with an id and title", async () => {
    const catalog = await loadCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    for (const entry of catalog) {
      expect(entry.id).toBeTruthy();
      expect(entry.title).toBeTruthy();
    }
  });

  it("marks nextjs as supporting the src/ layout option", async () => {
    const catalog = await loadCatalog();
    expect(findTemplate(catalog, "nextjs").srcLayout).toBe(true);
  });

  it("keeps vite and hono without srcLayout (src/ is fixed)", async () => {
    const catalog = await loadCatalog();
    expect(findTemplate(catalog, "vite").srcLayout).toBeFalsy();
    expect(findTemplate(catalog, "hono").srcLayout).toBeFalsy();
  });

  it("resolves a template directory case-insensitively", async () => {
    const resolved = await resolveTemplate("NextJS");
    expect(resolved.meta.id).toBe("nextjs");
    expect(resolved.dir).toMatch(/dist[\\/]templates[\\/]nextjs$/);
  });

  it("rejects unknown ids with a CliError", async () => {
    await expect(resolveTemplate("nope")).rejects.toThrow(CliError);
  });
});
