import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { templateDependencyRange } from "@/snapshot/transform";
import { cliPkg, distTemplatesRoot, packageRoot } from "./helpers.js";

type Catalog = { templates: Array<{ id: string; title: string }> };

describe("published files", () => {
  it("ships the bin and the templates, and no importable entry", async () => {
    expect(cliPkg.files).toEqual(["dist"]);
    expect(cliPkg.exports).toEqual({ "./package.json": "./package.json" });
    // The snapshot transform is a build helper, not part of the package.
    const emitted = await readdir(join(distTemplatesRoot, ".."), {
      recursive: true,
    });
    expect(emitted.filter((file) => /transform\.js/.test(file))).toEqual([]);
  });
});

describe("starter sources", () => {
  it("pin one @dimah-s3 version, on the CLI release line and not ahead of it", async () => {
    const templatesRoot = join(packageRoot, "..", "..", "templates");
    const catalog = JSON.parse(
      await readFile(join(templatesRoot, "catalog.json"), "utf8"),
    ) as Catalog;

    const pins = new Set<string>();
    for (const { id } of catalog.templates) {
      const pkg = JSON.parse(
        await readFile(join(templatesRoot, id, "package.json"), "utf8"),
      ) as { dependencies?: Record<string, string> };
      for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
        if (name.startsWith("@dimah-s3/")) pins.add(range);
      }
    }

    // `templates:update` writes the published version after each release,
    // so the pin may trail the CLI by one release but never lead it.
    expect([...pins]).toHaveLength(1);
    const [pin = ""] = pins;
    const pinned = parseVersion(pin.replace(/^\^/, ""));
    const cli = parseVersion(cliPkg.version);
    expect(pinned.major).toBe(cli.major);
    expect(compareVersions(pinned, cli)).toBeLessThanOrEqual(0);
  });
});

type Version = {
  major: number;
  minor: number;
  patch: number;
  /** Prerelease counter (`beta.11` is 11). A stable version is `Infinity`. */
  pre: number;
};

function parseVersion(version: string): Version {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[a-z]+\.(\d+))?$/.exec(version);
  if (!match) throw new Error(`Not an exact version: "${version}"`);
  const [, major, minor, patch, pre] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    pre: pre === undefined ? Number.POSITIVE_INFINITY : Number(pre),
  };
}

function compareVersions(a: Version, b: Version): number {
  for (const key of ["major", "minor", "patch", "pre"] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return 0;
}

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
        "AGENTS.md",
      ]) {
        expect(entries).toContain(name);
      }

      // A scaffolded app commits the lockfile its install writes.
      const gitignore = await readFile(join(snapshotDir, "_gitignore"), "utf8");
      expect(gitignore).not.toMatch(/lock/i);
      expect(gitignore).toMatch(/^\.env\*$/m);

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

      const dimahRanges = Object.entries({
        ...pkg.dependencies,
        ...pkg.devDependencies,
      })
        .filter(([name]) => name.startsWith("@dimah-s3/"))
        .map(([, range]) => range);
      expect(dimahRanges.length).toBeGreaterThan(0);
      const pinned = templateDependencyRange(cliPkg.version);
      expect(dimahRanges.every((range) => range === pinned)).toBe(true);
    }
  });
});
