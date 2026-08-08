import { installDependencies } from "nypm";

import type { CreateConfig } from "../../types.js";
import { CliError } from "../../utils/errors.js";
import { spinner } from "../../utils/ui.js";

export async function installDeps(config: CreateConfig): Promise<void> {
  if (!config.install) return;

  const s = spinner();
  s.start(`Installing dependencies with ${config.packageManager}`);
  try {
    await installDependencies({
      cwd: config.targetDir,
      packageManager: config.packageManager,
      silent: true,
      ignoreWorkspace: true,
    });
    s.stop(`Installed dependencies with ${config.packageManager}`);
  } catch (error) {
    s.stop("Failed to install dependencies");
    throw new CliError(error instanceof Error ? error.message : String(error));
  }
}
