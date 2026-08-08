import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
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

type RunResult = { stdout: string; stderr: string; exitCode: number };

async function runCli(args: string[], cwd: string): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [cliEntry, ...args],
      {
        cwd,
        env: {
          ...process.env,
          npm_config_user_agent: "pnpm/11.0.0 npm/? node/v24.0.0",
        },
      },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      exitCode: failure.code ?? 1,
    };
  }
}

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "dimah-s3-cli-"));
});

afterAll(async () => {
  if (workDir) {
    await rm(workDir, { recursive: true, force: true });
  }
});

describe("create e2e", () => {
  let appDir: string;

  beforeAll(async () => {
    appDir = join(workDir, "demo-app");
    const result = await runCli(
      [
        "create",
        "demo-app",
        "--yes",
        "--no-install",
        "--no-git",
        "--template",
        "nextjs",
      ],
      workDir,
    );
    expect(result.exitCode).toBe(0);
  }, 60_000);

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

describe("version flag", () => {
  it("prints the package version", async () => {
    const result = await runCli(["--version"], workDir);
    expect(result.exitCode).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(cliPkg.version);
  });
});

describe("create in the current directory", () => {
  it("names the project after the folder and skips the cd hint", async () => {
    const dir = join(workDir, "named-from-folder");
    await mkdir(dir, { recursive: true });

    const result = await runCli(
      ["create", ".", "--yes", "--no-install", "--no-git"],
      dir,
    );
    expect(result.exitCode).toBe(0);

    const pkg = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as {
      name: string;
    };
    expect(pkg.name).toBe("named-from-folder");
    expect(result.stdout).not.toContain("cd ");
  }, 60_000);
});

describe("non-empty target directory", () => {
  it("fails with an --overwrite hint", async () => {
    const dir = join(workDir, "occupied");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "keep-me.txt"), "hello", "utf8");

    const result = await runCli(
      ["create", "occupied", "--yes", "--no-install", "--no-git"],
      workDir,
    );

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("--overwrite");
    expect(await readdir(dir)).toEqual(["keep-me.txt"]);
  }, 60_000);

  it("replaces contents with --overwrite but keeps .git", async () => {
    const dir = join(workDir, "replaced");
    await mkdir(join(dir, ".git"), { recursive: true });
    await writeFile(join(dir, "stale.txt"), "old", "utf8");

    const result = await runCli(
      [
        "create",
        "replaced",
        "--yes",
        "--overwrite",
        "--no-install",
        "--no-git",
      ],
      workDir,
    );
    expect(result.exitCode).toBe(0);

    const entries = await readdir(dir);
    expect(entries).toContain(".git");
    expect(entries).toContain("package.json");
    expect(entries).not.toContain("stale.txt");
  }, 60_000);
});

describe("non-interactive fallback", () => {
  it("uses defaults without --yes when stdin is not a TTY", async () => {
    const result = await runCli(
      ["create", "piped-app", "--no-install", "--no-git"],
      workDir,
    );

    expect(result.exitCode).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("Non-interactive");
    expect(await readdir(join(workDir, "piped-app"))).toContain("package.json");
  }, 60_000);
});
