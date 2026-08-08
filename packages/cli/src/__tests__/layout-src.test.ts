import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { flattenSrcDirectory } from "../create/layout-src.js";

describe("flattenSrcDirectory", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "dimah-s3-src-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("moves src contents to the root and rewrites path aliases", async () => {
    await mkdir(join(dir, "src", "app"), { recursive: true });
    await mkdir(join(dir, "src", "lib"), { recursive: true });
    await writeFile(join(dir, "src", "app", "page.tsx"), "export default {}", "utf8");
    await writeFile(join(dir, "src", "lib", "utils.ts"), "export {}", "utf8");
    await writeFile(
      join(dir, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            paths: {
              "@/*": ["./src/*"],
              "other": ["./src/other"],
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(
      join(dir, "components.json"),
      `${JSON.stringify(
        {
          tailwind: { css: "src/app/globals.css" },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await flattenSrcDirectory(dir);

    const entries = await readdir(dir);
    expect(entries).toContain("app");
    expect(entries).toContain("lib");
    expect(entries).not.toContain("src");

    const tsconfig = JSON.parse(await readFile(join(dir, "tsconfig.json"), "utf8")) as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    expect(tsconfig.compilerOptions.paths["@/*"]).toEqual(["./*"]);
    expect(tsconfig.compilerOptions.paths.other).toEqual(["./other"]);

    const components = JSON.parse(
      await readFile(join(dir, "components.json"), "utf8"),
    ) as { tailwind: { css: string } };
    expect(components.tailwind.css).toBe("app/globals.css");
  });

  it("is a no-op when src/ is missing", async () => {
    await writeFile(join(dir, "package.json"), "{}\n", "utf8");
    await flattenSrcDirectory(dir);
    expect(await readdir(dir)).toEqual(["package.json"]);
  });
});
