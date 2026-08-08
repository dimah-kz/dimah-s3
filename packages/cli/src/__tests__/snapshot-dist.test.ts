import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const distTemplatesRoot = join(packageRoot, "dist", "templates");
const cliPkg = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
) as { version: string };

type Catalog = { templates: Array<{ id: string; title: string }> };

// Asserts the build-time snapshot under dist/templates/ (turbo runs build first).
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

      // Local-only artifacts from templates:update / templates:build must not ship.
      expect(entries).not.toContain("node_modules");
      expect(entries).not.toContain("pnpm-lock.yaml");
      expect(entries).not.toContain("package-lock.json");
      expect(entries).not.toContain("yarn.lock");
      expect(entries).not.toContain("dist");
      expect(entries).not.toContain("AGENTS.md");
      expect(entries).not.toContain(".gitignore");
      expect(entries).not.toContain(".env");
      expect(entries).not.toContain("next-env.d.ts");

      // End-user starter config + npm-safe gitignore name.
      expect(entries).toContain("pnpm-workspace.yaml");
      expect(entries).toContain("_gitignore");
      expect(entries).toContain("package.json");

      const pkg = JSON.parse(
        await readFile(join(snapshotDir, "package.json"), "utf8"),
      ) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const ranges = [
        ...Object.values(pkg.dependencies ?? {}),
        ...Object.values(pkg.devDependencies ?? {}),
      ];
      expect(ranges.some((r) => r.startsWith("catalog:"))).toBe(false);
      expect(ranges.some((r) => r.startsWith("workspace:"))).toBe(false);

      for (const field of ["dependencies", "devDependencies"] as const) {
        for (const [name, range] of Object.entries(pkg[field] ?? {})) {
          if (name.startsWith("@dimah-s3/")) {
            expect(range).toBe(`^${cliPkg.version}`);
          }
        }
      }
    }
  });
});
