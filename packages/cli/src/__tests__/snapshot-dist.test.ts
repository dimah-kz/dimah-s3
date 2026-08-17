import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cliPkg, distTemplatesRoot } from "./helpers.js";

type Catalog = { templates: Array<{ id: string; title: string }> };

describe("dist template snapshot", () => {
  it("ships every catalog template without local install artifacts", async () => {
    const catalog = JSON.parse(
      await readFile(join(distTemplatesRoot, "catalog.json"), "utf8"),
    ) as Catalog;

    expect(catalog.templates.length).toBeGreaterThan(0);

    for (const entry of catalog.templates) {
      expect(entry.id).toBeTruthy();
      expect(entry.title).toBeTruthy();

      const snapshotDir = join(distTemplatesRoot, entry.id);
      const entries = await readdir(snapshotDir);
      expect(entries.length).toBeGreaterThan(0);

      for (const name of [
        "node_modules",
        "pnpm-lock.yaml",
        "package-lock.json",
        "yarn.lock",
        "dist",
        "AGENTS.md",
        ".gitignore",
        ".env",
        "next-env.d.ts",
      ]) {
        expect(entries).not.toContain(name);
      }
      for (const name of [
        "pnpm-workspace.yaml",
        "_gitignore",
        "package.json",
      ]) {
        expect(entries).toContain(name);
      }

      const pkg = JSON.parse(
        await readFile(join(snapshotDir, "package.json"), "utf8"),
      ) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const ranges = Object.values({
        ...pkg.dependencies,
        ...pkg.devDependencies,
      });
      expect(ranges.some((r) => r.startsWith("catalog:"))).toBe(false);
      expect(ranges.some((r) => r.startsWith("workspace:"))).toBe(false);

      for (const [name, range] of Object.entries({
        ...pkg.dependencies,
        ...pkg.devDependencies,
      })) {
        if (name.startsWith("@dimah-s3/")) {
          expect(range).toBe(`^${cliPkg.version}`);
        }
      }
    }
  });
});
