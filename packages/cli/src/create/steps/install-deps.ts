import { errorMessage } from "@/utils/errors";
import { installCommand } from "@/utils/package-manager";
import { runCommand } from "@/utils/process";
import type { CreateStep } from "@/create/step";

/**
 * Install is recoverable: the project is already on disk, so a failure only
 * downgrades the final instructions to "install manually".
 *
 * It runs the package manager's own install in the project, as the user
 * would: a pnpm install reads the starter's `pnpm-workspace.yaml`, and
 * nothing is routed through corepack. The run's cancel signal stops it.
 */
export const installStep: CreateStep = {
  id: "install",
  title: (ctx) => `Installing dependencies with ${ctx.config.packageManager}`,
  enabled: (ctx) => ctx.config.install,
  recoverable: true,
  async run(ctx, _report, signal) {
    const { packageManager, targetDir } = ctx.config;
    const [command = packageManager, ...args] =
      installCommand(packageManager).split(" ");
    try {
      await runCommand(command, args, { cwd: targetDir, signal });
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
