import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const packageRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
export const cliEntry = join(packageRoot, "dist", "index.js");
export const distTemplatesRoot = join(packageRoot, "dist", "templates");
export const cliPkg = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
) as { version: string };

export const CREATE_TIMEOUT_MS = 60_000;

export type RunResult = { stdout: string; stderr: string; exitCode: number };

export async function runCli(args: string[], cwd: string): Promise<RunResult> {
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

/** Scaffold with the usual non-interactive flags; extra flags merge in. */
export async function createApp(
  cwd: string,
  name: string,
  flags: string[] = [],
): Promise<RunResult> {
  return runCli(
    ["create", name, "--yes", "--no-install", "--no-git", ...flags],
    cwd,
  );
}
