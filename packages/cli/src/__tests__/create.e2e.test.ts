import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliEntry = join(packageRoot, "dist", "index.js");
const cliPkg = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
) as { version: string };

describe("create e2e", () => {
  let workDir: string;
  let appDir: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), "dimah-s3-cli-"));
    appDir = join(workDir, "demo-app");

    await execFileAsync(
      process.execPath,
      [
        cliEntry,
        "create",
        "demo-app",
        "--yes",
        "--no-install",
        "--no-git",
        "--template",
        "nextjs",
      ],
      {
        cwd: workDir,
        env: {
          ...process.env,
          npm_config_user_agent: "pnpm/11.0.0 npm/? node/v24.0.0",
        },
      },
    );
  }, 60_000);

  afterAll(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it("scaffolds expected files", async () => {
    const files = await readdir(appDir);
    expect(files).toEqual(
      expect.arrayContaining([
        "package.json",
        "app",
        "lib",
        "components",
        ".gitignore",
        ".env.example",
        ".env",
      ]),
    );
    expect(files).not.toContain("_gitignore");
    expect(files).not.toContain("AGENTS.md");
  });

  it("sets package.json name and resolves ranges", async () => {
    const pkg = JSON.parse(
      await readFile(join(appDir, "package.json"), "utf8"),
    ) as {
      name: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(pkg.name).toBe("demo-app");

    const allRanges = [
      ...Object.values(pkg.dependencies),
      ...Object.values(pkg.devDependencies),
    ];
    expect(allRanges.some((r) => r.startsWith("catalog:"))).toBe(false);
    expect(allRanges.some((r) => r.startsWith("workspace:"))).toBe(false);

    expect(pkg.dependencies["@dimah-s3/server"]).toBe(`^${cliPkg.version}`);
    expect(pkg.dependencies["@dimah-s3/react"]).toBe(`^${cliPkg.version}`);
    expect(pkg.dependencies["@dimah-s3/ui"]).toBe(`^${cliPkg.version}`);
    expect(pkg.dependencies.react).toMatch(/^\d|^[\^~]/);
  });

  it("bundles every catalog template", async () => {
    const catalog = JSON.parse(
      await readFile(
        join(packageRoot, "dist", "templates", "catalog.json"),
        "utf8",
      ),
    ) as { templates: Array<{ id: string }> };

    for (const entry of catalog.templates) {
      const entries = await readdir(
        join(packageRoot, "dist", "templates", entry.id),
      );
      expect(entries.length).toBeGreaterThan(0);
    }
  });
});
