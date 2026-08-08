import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { CreateConfig } from "../../types.js";
import { logInfo, spinner } from "../../utils/ui.js";

const execFileAsync = promisify(execFile);

async function isInsideGitRepo(cwd: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
    });
    return true;
  } catch {
    return false;
  }
}

export async function initGit(config: CreateConfig): Promise<void> {
  if (!config.git) return;

  if (await isInsideGitRepo(config.targetDir)) {
    logInfo("Skipping git init (already inside a git repository).");
    return;
  }

  const s = spinner();
  s.start("Initializing git repository");
  try {
    await execFileAsync("git", ["init"], { cwd: config.targetDir });
    s.stop("Initialized git repository");
  } catch {
    s.stop("Skipped git init (git not available)");
  }
}
