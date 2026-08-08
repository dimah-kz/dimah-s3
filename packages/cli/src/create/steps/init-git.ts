import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { cliVersion } from "../../runtime.js";
import type { CreateStep } from "../step.js";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function isInsideRepo(cwd: string): Promise<boolean> {
  try {
    await git(["rev-parse", "--is-inside-work-tree"], cwd);
    return true;
  } catch {
    return false;
  }
}

async function isGitAvailable(): Promise<boolean> {
  try {
    await execFileAsync("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export const initGitStep: CreateStep = {
  id: "git",
  title: "Initializing git repository",
  enabled: (ctx) => ctx.config.git,
  recoverable: true,
  async run(ctx, report) {
    const cwd = ctx.config.targetDir;

    if (!(await isGitAvailable())) {
      return "Skipped git init (git is not installed)";
    }
    if (await isInsideRepo(cwd)) {
      return "Skipped git init (already inside a git repository)";
    }

    try {
      await git(["init", "-b", "main"], cwd);
    } catch {
      // `-b` needs git >= 2.28; fall back to the user's default branch name.
      await git(["init"], cwd);
    }

    report("Creating the initial commit");
    try {
      await git(["add", "-A"], cwd);
      await git(
        [
          "commit",
          "--no-verify",
          "-m",
          `Initial commit from @dimah-s3/cli v${cliVersion()}`,
        ],
        cwd,
      );
    } catch {
      return "Initialized git repository (no initial commit — configure git user.name/user.email)";
    }

    return "Initialized git repository with an initial commit";
  },
};
