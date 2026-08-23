import { installDependencies } from "nypm";

import { errorMessage } from "@/utils/errors";
import { installCommand } from "@/utils/package-manager";
import type { CreateStep } from "@/create/step";

/**
 * Install is recoverable: the project is already on disk, so a failure only
 * downgrades the final instructions to "install manually".
 */
export const installStep: CreateStep = {
  id: "install",
  title: (ctx) => `Installing dependencies with ${ctx.config.packageManager}`,
  enabled: (ctx) => ctx.config.install,
  recoverable: true,
  async run(ctx) {
    const { packageManager, targetDir } = ctx.config;
    try {
      await installDependencies({
        cwd: targetDir,
        packageManager,
        silent: true,
        ignoreWorkspace: true,
      });
    } catch (error) {
      throw new Error(
        `${errorMessage(error)}\nRun ${installCommand(packageManager)} inside the project to retry.`,
        { cause: error },
      );
    }
    ctx.installed = true;
    return `Installed dependencies with ${packageManager}`;
  },
};
