import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CREATE_TIMEOUT_MS, cliPkg, createApp, runCli } from "./helpers.js";

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
    const result = await createApp(workDir, "demo-app", [
      "--template",
      "nextjs",
    ]);
    expect(result.exitCode).toBe(0);
  }, CREATE_TIMEOUT_MS);

  it("scaffolds expected files", async () => {
    const files = await readdir(appDir);
    expect(files).toEqual(
      expect.arrayContaining([
        "package.json",
        "src",
        ".gitignore",
        ".env.example",
        ".env",
        "pnpm-workspace.yaml",
      ]),
    );
    expect(files).not.toContain("app");
    expect(files).not.toContain("_gitignore");
    expect(files).not.toContain("AGENTS.md");
    expect(files).not.toContain("node_modules");
    expect(files).not.toContain("pnpm-lock.yaml");

    const src = await readdir(join(appDir, "src"));
    expect(src).toEqual(expect.arrayContaining(["app", "lib", "components"]));
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
});

describe("create --template vite|hono", () => {
  it.each([
    {
      id: "vite",
      dir: "vite-app",
      expectFiles: [
        "package.json",
        "src",
        "server",
        "vite.config.ts",
        "index.html",
        ".env.example",
        "pnpm-workspace.yaml",
        ".gitignore",
      ],
    },
    {
      id: "hono",
      dir: "hono-app",
      expectFiles: [
        "package.json",
        "src",
        "vite.config.ts",
        "index.html",
        ".env.example",
        "pnpm-workspace.yaml",
        ".gitignore",
      ],
    },
  ] as const)(
    "scaffolds the $id starter",
    async ({ id, dir, expectFiles }) => {
      const result = await createApp(workDir, dir, ["--template", id]);
      expect(result.exitCode).toBe(0);

      const appDir = join(workDir, dir);
      const files = await readdir(appDir);
      expect(files).toEqual(expect.arrayContaining([...expectFiles]));
      expect(files).not.toContain("node_modules");
      expect(files).not.toContain("pnpm-lock.yaml");
      expect(files).not.toContain("_gitignore");

      const pkg = JSON.parse(
        await readFile(join(appDir, "package.json"), "utf8"),
      ) as {
        name: string;
        dependencies: Record<string, string>;
      };
      expect(pkg.name).toBe(dir);
      expect(pkg.dependencies.hono).toBeDefined();
      expect(pkg.dependencies["@dimah-s3/server"]).toBe(`^${cliPkg.version}`);
    },
    CREATE_TIMEOUT_MS,
  );

  it(
    "ignores --no-src for vite and keeps src/",
    async () => {
      const result = await createApp(workDir, "vite-nosrc", [
        "--no-src",
        "--template",
        "vite",
      ]);
      expect(result.exitCode).toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(
        /Ignoring for "vite"/i,
      );
      expect(await readdir(join(workDir, "vite-nosrc"))).toContain("src");
      expect(await readdir(join(workDir, "vite-nosrc"))).not.toContain(
        "main.tsx",
      );
    },
    CREATE_TIMEOUT_MS,
  );
});

describe("create --no-src", () => {
  it(
    "flattens the template out of src/",
    async () => {
      const result = await createApp(workDir, "flat-app", [
        "--no-src",
        "--template",
        "nextjs",
      ]);
      expect(result.exitCode).toBe(0);

      const appDir = join(workDir, "flat-app");
      const files = await readdir(appDir);
      expect(files).toEqual(
        expect.arrayContaining(["package.json", "app", "lib", "components"]),
      );
      expect(files).not.toContain("src");

      const tsconfig = JSON.parse(
        await readFile(join(appDir, "tsconfig.json"), "utf8"),
      ) as { compilerOptions: { paths: Record<string, string[]> } };
      expect(tsconfig.compilerOptions.paths["@/*"]).toEqual(["./*"]);

      const components = JSON.parse(
        await readFile(join(appDir, "components.json"), "utf8"),
      ) as { tailwind: { css: string } };
      expect(components.tailwind.css).toBe("app/globals.css");
    },
    CREATE_TIMEOUT_MS,
  );
});

describe("version flag", () => {
  it("prints the package version", async () => {
    const result = await runCli(["--version"], workDir);
    expect(result.exitCode).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(cliPkg.version);
  });
});

describe("create in the current directory", () => {
  it(
    "names the project after the folder and skips the cd hint",
    async () => {
      const dir = join(workDir, "named-from-folder");
      await mkdir(dir, { recursive: true });

      const result = await createApp(dir, ".");
      expect(result.exitCode).toBe(0);

      const pkg = JSON.parse(
        await readFile(join(dir, "package.json"), "utf8"),
      ) as {
        name: string;
      };
      expect(pkg.name).toBe("named-from-folder");
      expect(result.stdout).not.toContain("cd ");
    },
    CREATE_TIMEOUT_MS,
  );
});

describe("non-empty target directory", () => {
  it(
    "fails with an --overwrite hint",
    async () => {
      const dir = join(workDir, "occupied");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "keep-me.txt"), "hello", "utf8");

      const result = await createApp(workDir, "occupied");

      expect(result.exitCode).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("--overwrite");
      expect(await readdir(dir)).toEqual(["keep-me.txt"]);
    },
    CREATE_TIMEOUT_MS,
  );

  it(
    "replaces contents with --overwrite but keeps .git and .env",
    async () => {
      const dir = join(workDir, "replaced");
      await mkdir(join(dir, ".git"), { recursive: true });
      await writeFile(join(dir, ".env"), "S3_BUCKET=keep-me\n", "utf8");
      await writeFile(join(dir, "stale.txt"), "old", "utf8");

      const result = await createApp(workDir, "replaced", ["--overwrite"]);
      expect(result.exitCode).toBe(0);

      const entries = await readdir(dir);
      expect(entries).toContain(".git");
      expect(entries).toContain(".env");
      expect(entries).toContain("package.json");
      expect(entries).not.toContain("stale.txt");

      expect(await readFile(join(dir, ".env"), "utf8")).toBe(
        "S3_BUCKET=keep-me\n",
      );
    },
    CREATE_TIMEOUT_MS,
  );
});

describe("non-interactive fallback", () => {
  it(
    "uses defaults without --yes when stdin is not a TTY",
    async () => {
      const result = await runCli(
        ["create", "piped-app", "--no-install", "--no-git"],
        workDir,
      );

      expect(result.exitCode).toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("Non-interactive");
      expect(await readdir(join(workDir, "piped-app"))).toContain(
        "package.json",
      );
    },
    CREATE_TIMEOUT_MS,
  );

  it(
    "rejects --yes without a project directory",
    async () => {
      const result = await runCli(
        ["create", "--yes", "--no-install", "--no-git"],
        workDir,
      );

      expect(result.exitCode).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toMatch(
        /Project name is required/i,
      );
    },
    CREATE_TIMEOUT_MS,
  );
});
